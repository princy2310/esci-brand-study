"""
Phase 2: score a model's brand recommendations against ESCI ground truth.

For each competitive query, the model is asked which brands it would recommend,
with no tools and no web search, so the answer reflects what the model itself
associates with the query. The named brands are matched against the human
judgements and scored.

Reads ANTHROPIC_API_KEY from ../.env. Ground truth comes from the committed
esci.json, so this makes no ESCI calls. Results and every raw response are
cached to model_eval.json, and a rerun reuses the cache rather than paying again.

Usage:
    python3 score_model.py --limit 120
    python3 score_model.py --limit 5 --dry-run      # no API calls, checks selection
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import time
import urllib.error
import urllib.request

from precompute import normalise_brand

DATA = pathlib.Path("../dashboard/public/data/esci.json")
OUT = pathlib.Path("../dashboard/public/data/model_eval.json")
ENV = pathlib.Path("../.env")

MODEL = "claude-sonnet-4-5-20250929"
API = "https://api.anthropic.com/v1/messages"

# Anthropic list price per million tokens for this model, for a cost estimate only.
PRICE_IN_PER_M = 3.0
PRICE_OUT_PER_M = 15.0

PROMPT = (
    "A shopper on an online store searched for: \"{query}\".\n\n"
    "List the product brands you would recommend for this search. "
    "Reply with brand names only, as a comma-separated list, no other text."
)


def load_key() -> str:
    if ENV.exists():
        for line in ENV.read_text(encoding="utf-8").splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                return line.split("=", 1)[1].strip()
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise SystemExit("no ANTHROPIC_API_KEY in ../.env or environment")
    return key


def call_model(key: str, query: str, retries: int = 4) -> tuple[str, int, int]:
    body = json.dumps(
        {
            "model": MODEL,
            "max_tokens": 200,
            "messages": [{"role": "user", "content": PROMPT.format(query=query)}],
        }
    ).encode()
    req = urllib.request.Request(
        API,
        data=body,
        headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                d = json.loads(resp.read().decode())
            text = "".join(b.get("text", "") for b in d.get("content", []))
            u = d.get("usage", {})
            return text, u.get("input_tokens", 0), u.get("output_tokens", 0)
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 529) and attempt < retries - 1:
                wait = 10 * (attempt + 1)
                print(f"    {exc.code}, waiting {wait}s")
                time.sleep(wait)
                continue
            raise
    return "", 0, 0


def parse_brands(text: str) -> list[str]:
    """Split the model's comma-separated list into normalised brand keys."""
    # Drop any leading prose before a colon, and list bullets/numbers.
    text = text.split(":", 1)[-1] if ":" in text.split("\n", 1)[0] else text
    parts = re.split(r"[,\n]", text)
    keys: list[str] = []
    seen: set[str] = set()
    for p in parts:
        p = re.sub(r"^\s*[-*\d.)]+\s*", "", p).strip()
        if not p or len(p) > 40:
            continue
        key, _ = normalise_brand(p)
        if key and key not in seen:
            seen.add(key)
            keys.append(key)
    return keys


def _stem(query: str) -> frozenset[str]:
    """Significant words, for detecting near-duplicate queries."""
    return frozenset(w for w in re.findall(r"[a-z0-9]+", query.lower()) if len(w) > 2)


def select_queries(data: dict, limit: int) -> list[dict]:
    """
    Competitive sets suitable as a recommendation benchmark:

    - at least one Exact brand that is established (seen against 3+ queries and not
      a title-like string), so recall is measured against brands a model could
      plausibly name rather than one-off marketplace sellers, and
    - deduplicated by word stem, because the corpus holds several near-identical
      queries (variants of one print-on-demand t-shirt search) that would
      otherwise dominate and skew the result.

    Ground truth is the full judged brand set for the query.
    """
    out: list[dict] = []
    seen_stems: list[frozenset[str]] = []

    for s in data["competitiveSets"]:
        judged = {}
        for b in s["brands"]:
            k, _ = normalise_brand(b["brand"])
            if k:
                judged[k] = {
                    "display": b["brand"],
                    "label": b["label"],
                    "established": b["established"],
                }
        established_exact = [
            k for k, v in judged.items() if v["label"] == "Exact" and v["established"]
        ]
        if not established_exact:
            continue

        stem = _stem(s["query"])
        if any(stem and len(stem & prev) / len(stem | prev) > 0.6 for prev in seen_stems):
            continue
        seen_stems.append(stem)

        exact = [k for k, v in judged.items() if v["label"] == "Exact"]
        out.append({"query": s["query"], "judged": judged, "exact": exact})
        if len(out) >= limit:
            break
    return out


def score(named: list[str], judged: dict, exact: set[str], leaders: dict) -> dict:
    named_set = set(named)
    judged_keys = set(judged.keys())
    hit_exact = named_set & exact
    named_in_corpus = named_set & judged_keys
    named_sub = {k for k in named_set if judged.get(k, {}).get("label") == "Substitute"}
    off_corpus = named_set - judged_keys
    leader = leaders.get_query_leader(judged, exact)
    return {
        "recall": round(len(hit_exact) / len(exact), 3) if exact else None,
        # Precision over every brand named. Structurally low, because the model
        # names more brands than ESCI judged for the query.
        "precision": round(len(hit_exact) / len(named_set), 3) if named_set else None,
        # Precision over only the named brands ESCI actually judged. This strips out
        # ESCI's narrow per-query coverage: of the brands both the model and the
        # raters considered, how many did the model get right.
        "precisionInCorpus": round(len(hit_exact) / len(named_in_corpus), 3) if named_in_corpus else None,
        "substituteRate": round(len(named_sub) / len(named_set), 3) if named_set else None,
        # Named but not judged by ESCI for this query. Note this is mostly real
        # brands outside ESCI's coverage, not inventions, so it is not a
        # hallucination rate.
        "offCorpusRate": round(len(off_corpus) / len(named_set), 3) if named_set else None,
        "leaderCaptured": (leader in named_set) if leader else None,
        "namedCount": len(named_set),
        "inCorpusCount": len(named_in_corpus),
    }


class Leaders:
    """Per-query leader = the Exact brand with the most global judgements."""

    def __init__(self, data: dict):
        self.exact_by_key: dict[str, int] = {}
        for b in data["brands"]:
            k, _ = normalise_brand(b["brand"])
            if k:
                self.exact_by_key[k] = b["exact"]

    def get_query_leader(self, judged: dict, exact) -> str | None:
        cands = [k for k in exact]
        if not cands:
            return None
        return max(cands, key=lambda k: self.exact_by_key.get(k, 0))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit", type=int, default=120)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    data = json.loads(DATA.read_text(encoding="utf-8"))
    queries = select_queries(data, args.limit)
    leaders = Leaders(data)
    print(f"selected {len(queries)} competitive queries (limit {args.limit})")

    if args.dry_run:
        for q in queries[:5]:
            print(f"  {q['query']!r}  exact={len(q['exact'])} judged={len(q['judged'])}")
        print("dry run, no API calls made")
        return

    key = load_key()
    cache: dict[str, dict] = {}
    prev_in = prev_out = 0
    if OUT.exists():
        prev = json.loads(OUT.read_text(encoding="utf-8"))
        cache = {r["query"]: r for r in prev.get("perQuery", [])}
        prev_in, prev_out = prev.get("tokensIn", 0), prev.get("tokensOut", 0)
        print(f"  reusing {len(cache)} cached responses")

    checkpoint = OUT.with_suffix(".partial.json")
    if checkpoint.exists():
        for r in json.loads(checkpoint.read_text(encoding="utf-8")):
            cache.setdefault(r["query"], r)
        print(f"  resuming from checkpoint: {len(cache)} done")

    results = []
    tot_in = tot_out = 0
    for i, q in enumerate(queries, 1):
        cached = cache.get(q["query"])
        if cached and "response" in cached:
            # Reuse the cached response, but recompute the score so metric changes
            # apply without paying for the calls again.
            named = cached.get("named") or parse_brands(cached["response"])
            row = {
                "query": q["query"],
                "response": cached["response"],
                "named": named,
                **score(named, q["judged"], set(q["exact"]), leaders),
            }
            results.append(row)
            continue
        text, ti, to = call_model(key, q["query"])
        tot_in += ti
        tot_out += to
        named = parse_brands(text)
        row = {
            "query": q["query"],
            "response": text,
            "named": named,
            **score(named, q["judged"], set(q["exact"]), leaders),
        }
        results.append(row)
        # Checkpoint every query so an interrupt loses nothing and never re-pays.
        checkpoint.write_text(json.dumps(results, indent=2), encoding="utf-8")
        print(f"  {i}/{len(queries)}  named {row['namedCount']}  recall {row['recall']}  in/out {tot_in}/{tot_out}", flush=True)
        time.sleep(0.4)

    def mean(field: str) -> float | None:
        vals = [r[field] for r in results if r.get(field) is not None]
        return round(sum(vals) / len(vals), 3) if vals else None

    leader_vals = [r["leaderCaptured"] for r in results if r.get("leaderCaptured") is not None]
    # If this was a cache-only recompute (no new calls), keep the real run's totals.
    if tot_in == 0 and tot_out == 0 and (prev_in or prev_out):
        tot_in, tot_out = prev_in, prev_out
    cost = tot_in / 1e6 * PRICE_IN_PER_M + tot_out / 1e6 * PRICE_OUT_PER_M

    payload = {
        "model": MODEL,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "queries": len(results),
        "tokensIn": tot_in,
        "tokensOut": tot_out,
        "estCostUsd": round(cost, 2),
        "prompt": PROMPT,
        "note": (
            "Model run with no tools or web search, so answers reflect model knowledge. "
            "Brands matched to ESCI judgements by normalised key. Off-corpus brands may be "
            "post-2022 products absent from ESCI rather than inventions."
        ),
        "aggregate": {
            "recall": mean("recall"),
            "precision": mean("precision"),
            "precisionInCorpus": mean("precisionInCorpus"),
            "substituteRate": mean("substituteRate"),
            "offCorpusRate": mean("offCorpusRate"),
            "leaderCaptureRate": round(sum(leader_vals) / len(leader_vals), 3) if leader_vals else None,
            "meanNamed": mean("namedCount"),
            "meanInCorpus": mean("inCorpusCount"),
        },
        "perQuery": results,
    }
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    checkpoint.unlink(missing_ok=True)

    a = payload["aggregate"]
    print(f"\nwrote {OUT}")
    print(f"  queries scored:   {len(results)}")
    print(f"  recall:                {a['recall']}")
    print(f"  precision (all named): {a['precision']}")
    print(f"  precision (in-corpus): {a['precisionInCorpus']}")
    print(f"  substitute rate:       {a['substituteRate']}")
    print(f"  off-corpus rate:       {a['offCorpusRate']}")
    print(f"  leader capture:        {a['leaderCaptureRate']}")
    print(f"  mean named / in-corpus:{a['meanNamed']} / {a['meanInCorpus']}")
    print(f"  tokens in/out:    {tot_in}/{tot_out}   est cost ${payload['estCostUsd']}")


if __name__ == "__main__":
    main()
