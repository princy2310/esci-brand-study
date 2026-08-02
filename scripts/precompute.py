"""
Precompute aggregates from tasksource/esci for the brand-study dashboard.

Why precompute: Hugging Face caps anonymous API access at 500 requests per 5-minute
fixed window (https://huggingface.co/docs/hub/rate-limits), so the dashboard cannot
query it live. We sample once, derive the aggregates, and commit the JSON. That also
freezes the numbers so they are citable rather than shifting per page load.

Dataset: tasksource/esci (Apache-2.0)
Source:  Amazon Shopping Queries Dataset, Reddy et al., arXiv:2206.06588

Usage:
    python scripts/precompute.py --rows 15000 --out ../dashboard/public/data
"""

from __future__ import annotations

import argparse
import collections
import json
import pathlib
import re
import time
import urllib.error
import urllib.parse
import urllib.request

DATASET = "tasksource/esci"
BASE = "https://datasets-server.huggingface.co"
CORPUS_ROWS = 2_680_364
PAGE = 100

# ESCI relevance judgements, most to least relevant.
LABELS = ["Exact", "Substitute", "Complement", "Irrelevant"]


def fetch_page(offset: int, length: int = PAGE, retries: int = 4) -> list[dict]:
    """Fetch one page of rows, backing off on rate limits."""
    qs = urllib.parse.urlencode(
        {
            "dataset": DATASET,
            "config": "default",
            "split": "train",
            "offset": offset,
            "length": length,
        }
    )
    url = f"{BASE}/rows?{qs}"

    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "esci-brand-study/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                return [r["row"] for r in json.loads(resp.read().decode()).get("rows", [])]
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                # Rate limited: the window is 5 minutes, so wait rather than fail.
                wait = 30 * (attempt + 1)
                print(f"    rate limited at offset {offset}, waiting {wait}s")
                time.sleep(wait)
                continue
            raise
    print(f"    giving up on offset {offset}")
    return []


def collect(target_rows: int, locale: str | None, cache: pathlib.Path) -> list[dict]:
    """
    Sample the corpus, caching the raw rows.

    The cache exists because fetching is the expensive part: 200 pages against a
    rate-limited endpoint takes about fifteen minutes. Changing how the aggregates
    are derived should not cost that again.

    Note the corpus is ordered by locale, so evenly spaced offsets draw from the US
    block at the front and the highest offsets return nothing under a US filter.
    """
    if cache.exists():
        rows = json.loads(cache.read_text(encoding="utf-8"))
        print(f"using cached rows from {cache.name}: {len(rows)} rows")
        print(f"  delete {cache.name} to re-fetch\n")
        return rows

    n_pages = max(1, target_rows // PAGE)
    offsets = [int(CORPUS_ROWS * i / n_pages) for i in range(n_pages)]

    rows: list[dict] = []
    print(f"sampling {target_rows} rows across {n_pages} points of {CORPUS_ROWS:,}")
    for i, off in enumerate(offsets, start=1):
        page = fetch_page(off)
        if locale:
            page = [r for r in page if r.get("product_locale") == locale]
        rows.extend(page)
        if i % 25 == 0:
            print(f"  {i}/{n_pages} pages, {len(rows)} rows kept")
        time.sleep(0.3)
    print(f"  done: {len(rows)} rows kept")

    # Keep only the fields the aggregates use, so the cache stays a sensible size.
    slim = [
        {
            "query": r.get("query"),
            "product_brand": r.get("product_brand"),
            "esci_label": r.get("esci_label"),
            "product_locale": r.get("product_locale"),
        }
        for r in rows
    ]
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(slim), encoding="utf-8")
    print(f"  cached raw rows to {cache.name}\n")
    return slim


# ---------------------------------------------------------------------- #
# Brand normalisation
# ---------------------------------------------------------------------- #

# Sellers sometimes put a product description in the brand field. These are not
# brands in any useful sense, and counting them as competitors inflates set sizes
# with noise. Flagged rather than dropped, because how many there are is itself a
# finding about the dataset.
SUSPECT_MAX_CHARS = 34
SUSPECT_MAX_WORDS = 5

# Matches a non-Latin name carrying a parenthesised romanisation, in either ASCII
# or full-width brackets, e.g. コールマン(Coleman).
_ROMANISED = re.compile(
    r"^[^\x00-\x7f].*[(\uff08]([A-Za-z0-9 .&\'-]{2,})[)\uff09]\s*$"
)

# Anything above Latin Extended-B is another script. In a US-locale slice such a
# string is almost always an alias for a Latin-script brand present elsewhere in
# the data, but without a parenthesised romanisation there is nothing to key on.
_NON_LATIN = re.compile(r"[^\u0000-\u024f]")


def normalise_brand(raw: str) -> tuple[str, str]:
    """
    Return (grouping key, display name).

    Case variants such as 1MORE and 1More are the same company and must collapse,
    otherwise recall against the ground-truth brand set is measured against split
    entities. Brands written in another script with a romanised form in parentheses,
    which appear even under a US locale filter, resolve to the romanised form.
    """
    name = " ".join(raw.split()).strip(" .,-_/|")

    romanised = _ROMANISED.match(name)
    if romanised:
        name = romanised.group(1).strip()

    key = name.casefold().replace("-", " ").replace(".", "")
    key = " ".join(key.split())
    return key, name


def is_suspect(name: str) -> bool:
    """True when the string looks like a product title rather than a brand."""
    return len(name) > SUSPECT_MAX_CHARS or len(name.split()) > SUSPECT_MAX_WORDS


def is_non_latin(name: str) -> bool:
    """
    True when the string is written in a non-Latin script with no romanisation.

    These cannot be resolved to their Latin-script counterpart without an alias
    table, so `Canon` and `\u30ad\u30e4\u30ce\u30f3` stay separate entities. Left in the
    substitute graph they read as a brand competing with itself, so they are
    excluded there and counted instead.
    """
    return bool(_NON_LATIN.search(name))


def build(rows: list[dict]) -> dict:
    """Derive every aggregate the dashboard needs from the sampled rows."""

    # query -> brand key -> label. A query/brand pair can appear on several products;
    # keep the most relevant judgement so a brand is credited fairly.
    label_rank = {lab: i for i, lab in enumerate(LABELS)}
    per_query: dict[str, dict[str, str]] = collections.defaultdict(dict)
    query_products: collections.Counter[str] = collections.Counter()

    brand_labels: dict[str, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    brand_queries: dict[str, set[str]] = collections.defaultdict(set)
    # Every original spelling seen for a key, so the display name is the common one
    # and the count of collapsed variants can be reported.
    brand_variants: dict[str, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    label_totals: collections.Counter[str] = collections.Counter()
    rows_with_brand = 0

    for row in rows:
        query = (row.get("query") or "").strip()
        raw_brand = (row.get("product_brand") or "").strip()
        label = row.get("esci_label")
        if not query or label not in label_rank:
            continue

        label_totals[label] += 1
        query_products[query] += 1

        if not raw_brand:
            continue
        rows_with_brand += 1

        key, display = normalise_brand(raw_brand)
        if not key:
            continue

        brand_labels[key][label] += 1
        brand_queries[key].add(query)
        brand_variants[key][display] += 1

        existing = per_query[query].get(key)
        if existing is None or label_rank[label] < label_rank[existing]:
            per_query[query][key] = label

    def display_of(key: str) -> str:
        """
        Pick the canonical spelling deterministically.

        Counter.most_common breaks ties by insertion order, so 1More and 1MORE at
        three occurrences each would resolve differently between runs and silently
        relabel the output. Sorting by count then name makes regeneration
        reproducible.
        """
        return min(brand_variants[key].items(), key=lambda kv: (-kv[1], kv[0]))[0]

    collapsed_variants = sum(1 for k in brand_variants if len(brand_variants[k]) > 1)
    suspect_keys = {k for k in brand_labels if is_suspect(display_of(k))}
    non_latin_keys = {k for k in brand_labels if is_non_latin(display_of(k))}

    # Competitive sets: queries where more than one brand was judged.
    competitive = {q: b for q, b in per_query.items() if len(b) > 1}

    # Share of voice, in the sense the AEO tools use it: how much of the query set a
    # brand shows up in, regardless of whether it belonged there. Counted over
    # competitive queries only, so the denominator is contests the brand could have
    # been part of. This exists to be compared against agreement with the human
    # judgements, which is the point of the study.
    brand_competitive: dict[str, set[str]] = collections.defaultdict(set)
    for q, brands_in_q in competitive.items():
        for key in brands_in_q:
            brand_competitive[key].add(q)
    n_competitive = len(competitive) or 1

    # Substitute co-occurrence: brands judged Substitute on the same query are
    # human-labelled near-alternatives to each other.
    sub_pairs: collections.Counter[tuple[str, str]] = collections.Counter()
    for brands in per_query.values():
        subs = sorted(b for b, lab in brands.items() if lab == "Substitute")
        for i in range(len(subs)):
            for j in range(i + 1, len(subs)):
                sub_pairs[(subs[i], subs[j])] += 1

    def brand_record(key: str) -> dict:
        counts = brand_labels[key]
        total = sum(counts.values())
        return {
            "brand": display_of(key),
            "judgements": total,
            "queries": len(brand_queries[key]),
            "exact": counts.get("Exact", 0),
            "substitute": counts.get("Substitute", 0),
            "complement": counts.get("Complement", 0),
            "irrelevant": counts.get("Irrelevant", 0),
            # Share of this brand's judgements that were Exact. High breadth with
            # low exactRate means the brand surfaces often but rarely fits. This is
            # the agreement measure: does the brand belong where it turns up.
            "exactRate": round(counts.get("Exact", 0) / total * 100, 1) if total else 0.0,
            # Competitive queries the brand appears in, and that as a share of all
            # of them. The second is share of voice as the AEO tools define it.
            "competitiveQueries": len(brand_competitive[key]),
            "shareOfVoice": round(len(brand_competitive[key]) / n_competitive * 100, 2),
            # Spellings collapsed into this record, e.g. 1MORE and 1More.
            "variants": len(brand_variants[key]),
            # Looks like a product title rather than a brand.
            "suspect": key in suspect_keys,
            # Non-Latin script with no romanisation to key on.
            "nonLatin": key in non_latin_keys,
        }

    # Ship every brand. Truncating made the "every brand string" view a false
    # promise and hid most of the flagged entries, since title-like strings and
    # split spellings are low-volume by nature and sit deep in the ranking.
    brands_out = sorted(
        (brand_record(b) for b in brand_labels),
        key=lambda r: (-r["judgements"], r["brand"]),
    )

    # Rank sets by how many of their brands are recognisable, not by raw brand
    # count. Sorting on raw count surfaces queries crowded with single-appearance
    # marketplace sellers, which are the least useful examples in the dataset.
    established = {k for k in brand_labels if len(brand_queries[k]) >= 3 and k not in suspect_keys}

    def set_quality(item: tuple[str, dict[str, str]]) -> tuple:
        query, brands = item
        known = sum(1 for b in brands if b in established)
        return (-known, -len(brands), query)

    top_queries = sorted(competitive.items(), key=set_quality)[:400]
    competitive_out = [
        {
            "query": q,
            "brandCount": len(brands),
            "products": query_products[q],
            "establishedBrands": sum(1 for b in brands if b in established),
            "brands": [
                {
                    "brand": display_of(b),
                    "label": lab,
                    "established": b in established,
                }
                for b, lab in sorted(brands.items(), key=lambda kv: (label_rank[kv[1]], kv[0]))
            ],
        }
        for q, brands in top_queries
    ]

    # Collapsing spellings removes pairs like 1MORE / 1More, but two cases remain
    # that would read as a brand competing with itself or with a product title:
    # title-like strings, and non-Latin aliases such as Canon / キヤノン that have no
    # romanisation to key on. Both are excluded here and counted in totals.
    excluded_pair_keys = suspect_keys | non_latin_keys
    substitute_out = [
        {"a": display_of(a), "b": display_of(b), "count": n}
        for (a, b), n in sub_pairs.most_common(900)
        if a not in excluded_pair_keys and b not in excluded_pair_keys
    ][:300]

    sizes = sorted(len(b) for b in competitive.values()) or [0]

    # ---- share of voice against agreement, with its own sensitivity check ----
    #
    # Ranking brands by share of voice and by agreement gives two different
    # orderings, which is the study's central comparison. But agreement rate is not
    # comparable across brands of different breadth: a brand judged on one query
    # cannot be wrong, so 100% is trivial at low breadth. Reporting a single
    # correlation would pass off that artifact as a finding, so the sweep ships too.

    def spearman(pool: list[dict]) -> float | None:
        n = len(pool)
        if n < 3:
            return None
        by_voice = sorted(pool, key=lambda b: (-b["shareOfVoice"], b["brand"]))
        by_agree = sorted(pool, key=lambda b: (-b["exactRate"], b["brand"]))
        vr = {b["brand"]: i + 1 for i, b in enumerate(by_voice)}
        ar = {b["brand"]: i + 1 for i, b in enumerate(by_agree)}
        ss = sum((vr[b["brand"]] - ar[b["brand"]]) ** 2 for b in pool)
        return round(1 - (6 * ss) / (n * (n * n - 1)), 3)

    rankable = [b for b in brands_out if not b["suspect"] and not b["nonLatin"]]

    floors = []
    for min_q in (1, 3, 5, 8, 12):
        pool = [b for b in rankable if b["judgements"] >= 10 and b["queries"] >= min_q]
        rho = spearman(pool)
        floors.append(
            {
                "minQueries": min_q,
                "brands": len(pool),
                "rho": rho,
                "perfectAgreement": sum(1 for b in pool if b["exactRate"] == 100.0),
            }
        )

    breadth_buckets = []
    for lo, hi, label in ((1, 1, "1"), (2, 2, "2"), (3, 4, "3 to 4"), (5, 8, "5 to 8"), (9, 10**6, "9 or more")):
        pool = [b for b in rankable if b["judgements"] >= 10 and lo <= b["queries"] <= hi]
        if not pool:
            continue
        perfect = sum(1 for b in pool if b["exactRate"] == 100.0)
        breadth_buckets.append(
            {
                "queries": label,
                "brands": len(pool),
                "meanAgreement": round(sum(b["exactRate"] for b in pool) / len(pool), 1),
                "perfectAgreement": perfect,
                "perfectPct": round(perfect / len(pool) * 100, 1),
            }
        )

    return {
        "meta": {
            "dataset": DATASET,
            "license": "Apache-2.0",
            "citation": "Reddy et al., Shopping Queries Dataset (ESCI), arXiv:2206.06588",
            "corpusRows": CORPUS_ROWS,
            "sampledRows": len(rows),
            "samplePct": round(len(rows) / CORPUS_ROWS * 100, 4),
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "note": (
                "US locale only. The corpus is ordered by locale, so evenly spaced offsets "
                "draw from the US block at the front and the final offsets return no US rows. "
                "The sample is therefore even across the US portion, not across all 2.68M rows. "
                "ESCI has no category column, so the unit of analysis is the query, not the "
                "product category."
            ),
        },
        "totals": {
            "rowsWithBrand": rows_with_brand,
            "distinctBrands": len(brand_labels),
            "distinctQueries": len(per_query),
            "competitiveQueries": len(competitive),
            "competitivePct": round(len(competitive) / len(per_query) * 100, 1) if per_query else 0.0,
            "brandsPerCompetitiveQuery": {
                "min": sizes[0],
                "median": sizes[len(sizes) // 2],
                "max": sizes[-1],
            },
            "labelDistribution": {lab: label_totals.get(lab, 0) for lab in LABELS},
            # Data-quality counters. These are findings about ESCI, not incidental
            # plumbing: they bound how far the brand column can be trusted.
            "brandsWithVariants": collapsed_variants,
            "suspectBrands": len(suspect_keys),
            "establishedBrands": len(established),
            "nonLatinBrands": len(non_latin_keys),
            # Strings flagged both title-like and split-spelling, so the two
            # counters above are not disjoint.
            "suspectAndVariant": sum(
                1 for k in suspect_keys if len(brand_variants[k]) > 1
            ),
        },
        "voiceVsAgreement": {
            # The floor the dashboard uses when ranking. Ten judgements alone was
            # not enough: it let brands seen on a single query into the ranking.
            "minJudgements": 10,
            "minQueries": 5,
            "floors": floors,
            "breadthBuckets": breadth_buckets,
        },
        "brands": brands_out,
        "competitiveSets": competitive_out,
        "substitutePairs": substitute_out,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--rows", type=int, default=15000, help="approximate rows to sample")
    ap.add_argument("--locale", default="us", help="product_locale filter, or 'all'")
    ap.add_argument("--out", default="../dashboard/public/data", help="output directory")
    ap.add_argument("--cache", default=".cache/rows.json", help="raw row cache path")
    args = ap.parse_args()

    locale = None if args.locale == "all" else args.locale
    rows = collect(args.rows, locale, pathlib.Path(args.cache))
    if not rows:
        raise SystemExit("no rows collected")

    data = build(rows)

    out_dir = pathlib.Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "esci.json"
    out_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    t = data["totals"]
    print(f"wrote {out_path}  ({out_path.stat().st_size/1024:.0f} KB)")
    print(f"  rows sampled:        {data['meta']['sampledRows']:,}")
    print(f"  distinct brands:     {t['distinctBrands']:,}  (all shipped)")
    print(f"    with variants:     {t['brandsWithVariants']:,} (spellings collapsed)")
    print(f"    suspect titles:    {t['suspectBrands']:,} ({t['suspectAndVariant']} also split spellings)")
    print(f"    non-Latin script:  {t['nonLatinBrands']:,} (excluded from substitute graph)")
    print(f"    established:       {t['establishedBrands']:,} (3+ queries, not suspect)")
    print(f"  distinct queries:    {t['distinctQueries']:,}")
    print(f"  competitive queries: {t['competitiveQueries']:,} ({t['competitivePct']}%)")
    print(f"  brands/query:        {t['brandsPerCompetitiveQuery']}")
    print(f"  labels:              {t['labelDistribution']}")


if __name__ == "__main__":
    main()
