"""
Fact-check every number that appears in the README, commit message and UI
against the committed data file. Prints PASS/FAIL per claim.

Run from scripts/. Not part of the pipeline.
"""

import json
import pathlib
import re

data = json.loads(pathlib.Path("../dashboard/public/data/esci.json").read_text(encoding="utf-8"))
meta, totals = data["meta"], data["totals"]
brands, sets, pairs = data["brands"], data["competitiveSets"], data["substitutePairs"]

results: list[tuple[bool, str, str]] = []


def check(label: str, claimed, actual) -> None:
    ok = claimed == actual
    detail = f"claimed {claimed!r}, actual {actual!r}"
    results.append((ok, label, detail))


# ---- claims made in README / commit message / UI ----
check("sampled rows = 10,746", 10746, meta["sampledRows"])
check("corpus rows = 2,680,364", 2680364, meta["corpusRows"])
check("sample pct = 0.4009", 0.4009, meta["samplePct"])
check("licence = Apache-2.0", "Apache-2.0", meta["license"])
check("dataset = tasksource/esci", "tasksource/esci", meta["dataset"])

check("distinct brands = 3,928", 3928, totals["distinctBrands"])
check("distinct queries = 2,770", 2770, totals["distinctQueries"])
check("competitive queries = 998", 998, totals["competitiveQueries"])
check("competitive pct = 36.0", 36.0, totals["competitivePct"])
check("established brands = 602", 602, totals["establishedBrands"])
check("brands with variants = 23", 23, totals["brandsWithVariants"])
check("suspect brands = 36", 36, totals["suspectBrands"])
check("median brands/competitive query = 4", 4, totals["brandsPerCompetitiveQuery"]["median"])
check("max brands/competitive query = 35", 35, totals["brandsPerCompetitiveQuery"]["max"])

check("Exact judgements = 7,634", 7634, totals["labelDistribution"]["Exact"])
check("Substitute judgements = 2,172", 2172, totals["labelDistribution"]["Substitute"])
check("Complement judgements = 178", 178, totals["labelDistribution"]["Complement"])
check("Irrelevant judgements = 762", 762, totals["labelDistribution"]["Irrelevant"])

# ---- derived claims ----
established_pct = round(totals["establishedBrands"] / totals["distinctBrands"] * 100)
check("established share = 15%", 15, established_pct)

# Every brand must ship, or the flagged counts above are unbrowsable and the
# "every brand string" view is a false promise.
check("brands array holds every brand", totals["distinctBrands"], len(brands))

variant_brands = [b for b in brands if b["variants"] > 1]
check("brands array variant count matches totals", totals["brandsWithVariants"], len(variant_brands))

suspect_brands = [b for b in brands if b["suspect"]]
check("brands array suspect count matches totals", totals["suspectBrands"], len(suspect_brands))

non_latin_brands = [b for b in brands if b["nonLatin"]]
check("brands array nonLatin count matches totals", totals["nonLatinBrands"], len(non_latin_brands))

# ---- specific examples cited in prose ----
names = {b["brand"] for b in brands}
for cited in ["1MORE", "Utz", "AVERY", "KREG", "Amazon Basics", "Anker", "Apple"]:
    results.append((cited in names, f"cited brand present: {cited}", "" if cited in names else "absent"))

# 1MORE is cited as a collapsed-spelling example. The canonical spelling is chosen
# deterministically by (count desc, name asc), which resolves the 3-3 tie to 1MORE.
one_more = next((b for b in brands if b["brand"] == "1MORE"), None)
results.append(
    (
        one_more is not None and one_more["variants"] > 1,
        "1MORE has collapsed spellings",
        f"variants={one_more['variants'] if one_more else 'n/a'}",
    )
)

# Canonical spellings must be reproducible, not dependent on dict insertion order.
results.append(
    (
        one_more is not None and one_more["brand"] == "1MORE",
        "tie-broken display name is deterministic (1MORE, not 1More)",
        f"got {one_more['brand'] if one_more else 'absent'}",
    )
)

# ---- share of voice against agreement ----
sens = data["voiceVsAgreement"]
check("breadth floor is 5 queries", 5, sens["minQueries"])
check("judgement floor is 10", 10, sens["minJudgements"])

no_floor = next((f for f in sens["floors"] if f["minQueries"] == 1), None)
used_floor = next((f for f in sens["floors"] if f["minQueries"] == sens["minQueries"]), None)
results.append(
    (
        no_floor is not None and no_floor["rho"] is not None and no_floor["rho"] < 0,
        "correlation is negative with no breadth floor (the artifact)",
        f"rho={no_floor['rho'] if no_floor else 'n/a'}",
    )
)
results.append(
    (
        used_floor is not None and used_floor["rho"] is not None and used_floor["rho"] > 0,
        "correlation turns positive under the floor used",
        f"rho={used_floor['rho'] if used_floor else 'n/a'}",
    )
)

rhos = [f["rho"] for f in sens["floors"] if f["rho"] is not None]
results.append(
    (
        all(abs(r) <= 0.15 for r in rhos),
        "correlation stays near zero at every floor (|rho| <= 0.15)",
        f"max |rho|={max(abs(r) for r in rhos):.3f}",
    )
)

# The breadth artifact must be visible in the buckets: agreement falls as breadth
# rises, and perfect scores collapse.
buckets = sens["breadthBuckets"]
first, last = buckets[0], buckets[-1]
results.append(
    (
        first["meanAgreement"] > last["meanAgreement"],
        "mean agreement falls as breadth rises",
        f"{first['queries']}: {first['meanAgreement']}% vs {last['queries']}: {last['meanAgreement']}%",
    )
)
results.append(
    (
        first["perfectPct"] > last["perfectPct"],
        "share at 100% agreement collapses as breadth rises",
        f"{first['perfectPct']}% vs {last['perfectPct']}%",
    )
)

# Share of voice must be internally consistent with the competitive query count.
n_comp = totals["competitiveQueries"]
bad_sov = [
    b["brand"]
    for b in brands
    if abs(round(b["competitiveQueries"] / n_comp * 100, 2) - b["shareOfVoice"]) > 0.02
]
results.append((not bad_sov, "shareOfVoice matches competitiveQueries/total", f"{len(bad_sov)} mismatched"))

# A brand cannot appear in more competitive queries than total queries.
bad_breadth = [b["brand"] for b in brands if b["competitiveQueries"] > b["queries"]]
results.append(
    (not bad_breadth, "competitiveQueries never exceeds total queries", f"{len(bad_breadth)} violate")
)

# Utz cited as a collapsed-spelling example
utz = next((b for b in brands if b["brand"] == "Utz"), None)
results.append(
    (
        utz is not None and utz["variants"] > 1,
        "Utz has collapsed spellings",
        f"variants={utz['variants'] if utz else 'n/a'}",
    )
)

# Breadth figures quoted in the hand-off summary
for name, q, rate in [("Amazon Basics", 46, 78.6), ("Anker", 35, 76.9), ("Apple", 38, 57.9)]:
    b = next((x for x in brands if x["brand"] == name), None)
    ok = b is not None and b["queries"] == q and b["exactRate"] == rate
    results.append(
        (
            ok,
            f"{name}: {q} queries at {rate}% exact",
            "" if ok else f"actual {b['queries']} queries at {b['exactRate']}%" if b else "absent",
        )
    )

# The worked example the hero picks, and the set cited in the summary
albany = next((s for s in sets if s["query"] == "albany park sofa"), None)
results.append((albany is not None, "'albany park sofa' set exists", "" if albany else "absent"))
if albany:
    rivet = next((b for b in albany["brands"] if b["brand"] == "Rivet"), None)
    results.append(
        (
            rivet is not None and rivet["label"] == "Exact",
            "Rivet judged Exact for 'albany park sofa'",
            "" if rivet and rivet["label"] == "Exact" else f"actual {rivet['label'] if rivet else 'absent'}",
        )
    )
    for sub in ["Acanva", "FDW", "HONBAY"]:
        b = next((x for x in albany["brands"] if x["brand"] == sub), None)
        ok = b is not None and b["label"] == "Substitute"
        results.append(
            (ok, f"{sub} judged Substitute for 'albany park sofa'", "" if ok else f"actual {b['label'] if b else 'absent'}")
        )

joycon = next((s for s in sets if s["query"] == "joycon charging dock"), None)
results.append((joycon is not None, "'joycon charging dock' set exists", "" if joycon else "absent"))

# No self-pairs should survive normalisation
self_pairs = [p for p in pairs if p["a"].casefold() == p["b"].casefold()]
results.append((len(self_pairs) == 0, "no casefold self-pairs in substitute graph", f"{len(self_pairs)} found"))

# The check above missed Canon / キヤノン, because a non-Latin alias is not
# casefold-equal to its Latin counterpart. Assert the exclusion directly.
non_latin_pairs = [p for p in pairs if re.search(r"[^\u0000-\u024f]", p["a"] + p["b"])]
results.append(
    (
        len(non_latin_pairs) == 0,
        "no non-Latin aliases in substitute graph",
        f"{len(non_latin_pairs)} found: {[f'{p['a']}/{p['b']}' for p in non_latin_pairs][:3]}",
    )
)

# Title-like strings should not appear in the competitor map either.
suspect_names = {b["brand"] for b in brands if b["suspect"]}
suspect_pairs = [p for p in pairs if p["a"] in suspect_names or p["b"] in suspect_names]
results.append(
    (len(suspect_pairs) == 0, "no title-like strings in substitute graph", f"{len(suspect_pairs)} found")
)

# Substitute pairs cited in prose
pair_set = {(p["a"], p["b"]) for p in pairs}
for a, b in [("ABCCANOPY", "Eurmax"), ("Ten Speed Press", "Three Rivers Press"), ("Mellow", "Novogratz")]:
    ok = (a, b) in pair_set or (b, a) in pair_set
    results.append((ok, f"cited pair present: {a} / {b}", "" if ok else "absent"))

# Internal consistency: every brand's label counts must sum to its judgement total
bad_sums = [
    b["brand"]
    for b in brands
    if b["exact"] + b["substitute"] + b["complement"] + b["irrelevant"] != b["judgements"]
]
results.append((not bad_sums, "brand label counts sum to judgements", f"{len(bad_sums)} mismatched"))

# Internal consistency: exactRate must equal exact/judgements
bad_rates = [
    b["brand"]
    for b in brands
    if b["judgements"] and abs(round(b["exact"] / b["judgements"] * 100, 1) - b["exactRate"]) > 0.05
]
results.append((not bad_rates, "exactRate matches exact/judgements", f"{len(bad_rates)} mismatched"))

# Internal consistency: establishedBrands per set must match the flags
bad_est = [s["query"] for s in sets if sum(1 for b in s["brands"] if b["established"]) != s["establishedBrands"]]
results.append((not bad_est, "set establishedBrands matches per-brand flags", f"{len(bad_est)} mismatched"))

# Internal consistency: brandCount must match the brands array length
bad_count = [s["query"] for s in sets if len(s["brands"]) != s["brandCount"]]
results.append((not bad_count, "set brandCount matches brands array", f"{len(bad_count)} mismatched"))

# competitivePct must be derivable
derived_pct = round(totals["competitiveQueries"] / totals["distinctQueries"] * 100, 1)
check("competitivePct is derivable from counts", derived_pct, totals["competitivePct"])

# Brand coverage quoted in the README. An earlier draft cited 93.4%, carried over
# from scratch work with no artifact; the measured figure for this sample is 95.9%.
coverage = round(totals["rowsWithBrand"] / meta["sampledRows"] * 100, 1)
check("brand coverage on the sample = 95.9%", 95.9, coverage)

# ---- corpus screening, reproduced by scripts/corpus_screen.py ----
screen_path = pathlib.Path("../dashboard/public/data/corpus_screen.json")
if not screen_path.exists():
    results.append((False, "corpus_screen.json exists", "run scripts/corpus_screen.py"))
else:
    screen = json.loads(screen_path.read_text(encoding="utf-8"))
    by_id = {c["dataset"]: c for c in screen["corpora"]}

    esci_s = by_id.get("tasksource/esci", {})
    arena_s = by_id.get("lmarena-ai/arena-human-preference-140k", {})
    geo_s = by_id.get("NomaDamas/geobench", {})

    # The decisive structural test.
    results.append(
        (esci_s.get("hasBrandColumn") is True, "ESCI has a brand column", str(esci_s.get("hasBrandColumn")))
    )
    results.append(
        (
            arena_s.get("hasBrandColumn") is False,
            "arena has no brand column (the decisive rejection)",
            str(arena_s.get("hasBrandColumn")),
        )
    )

    check("ESCI licence is apache-2.0 per the API", "apache-2.0", esci_s.get("license"))
    check("arena licence is cc-by-4.0 per the API", "cc-by-4.0", arena_s.get("license"))
    check("arena row count is 135,634", 135634, arena_s.get("rows"))

    # The inversion that showed the original argument was wrong.
    results.append(
        (
            arena_s.get("intentPct") is not None
            and esci_s.get("intentPct") is not None
            and arena_s["intentPct"] > esci_s["intentPct"],
            "arena scores HIGHER than ESCI on recommendation phrasing",
            f"arena {arena_s.get('intentPct')}% vs esci {esci_s.get('intentPct')}%",
        )
    )

    # geobench cannot be read, so no claim about it is reproducible.
    results.append(
        (
            geo_s.get("error") is not None or geo_s.get("rows") is None,
            "geobench is not publicly readable, so no figure is claimed",
            f"error={geo_s.get('error')}",
        )
    )

    # The regex must ship with the numbers it produced.
    results.append(
        (
            bool(screen.get("intentPattern")),
            "intent regex is stored alongside the results",
            "missing",
        )
    )

# ---- output ----
passed = sum(1 for ok, _, _ in results if ok)
failed = len(results) - passed

for ok, label, detail in results:
    mark = "PASS" if ok else "FAIL"
    line = f"  {mark}  {label}"
    if not ok and detail:
        line += f"   [{detail}]"
    print(line)

print()
print(f"{passed} passed, {failed} failed, {len(results)} total")
