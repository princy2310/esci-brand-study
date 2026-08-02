"""
Screen candidate corpora against the requirements of a brand-correctness study,
and write the result to a committed JSON file.

Every figure quoted in the README about a rejected corpus comes from here. An
earlier draft carried those numbers over from scratch work with no artifact, which
made them unreproducible by anyone reading the repo.

Three requirements, in order of how decisive they are:

1. Brand labels. Without a brand field there is nothing to score a model against,
   and no amount of intent density compensates. This is structural and decisive.
2. Commercial intent. A corpus of factual lookups cannot support a question about
   brand choice.
3. A licence permitting reuse.

Usage:
    python3 corpus_screen.py --out ../dashboard/public/data
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://datasets-server.huggingface.co"
HF_API = "https://huggingface.co/api/datasets"

CANDIDATES = [
    {
        "id": "tasksource/esci",
        "split": "train",
        "config": "default",
        "text_field": "query",
        "brand_field": "product_brand",
    },
    {
        "id": "lmarena-ai/arena-human-preference-140k",
        "split": "train",
        "config": None,
        "text_field": "conversation_a",
        "brand_field": None,
    },
    {
        "id": "NomaDamas/geobench",
        "split": "train",
        "config": None,
        "text_field": None,
        "brand_field": None,
    },
]

# Recommendation intent: the prompt is asking which thing to choose or buy.
# Deliberately broad, since a permissive pattern that still finds little intent is
# stronger evidence against a corpus than a strict one.
INTENT = re.compile(
    r"\b(best|top|recommend\w*|which\s+(one|brand|product|should)|vs\.?|versus|"
    r"compare|alternative[s]?|better\s+than|worth\s+buying|should\s+i\s+(buy|get|use)|"
    r"cheapest|good\s+for|looking\s+for\s+a)\b",
    re.I,
)

# Brand-bearing prompts need a proper noun that is not sentence-initial. Crude, and
# reported as an upper bound rather than a count.
CAPITALISED = re.compile(r"(?<![.!?]\s)(?<!^)\b[A-Z][a-zA-Z0-9]{2,}\b")


def get_json(url: str, retries: int = 3) -> dict | None:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "esci-brand-study/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                wait = 20 * (attempt + 1)
                print(f"      rate limited, waiting {wait}s")
                time.sleep(wait)
                continue
            return {"__error__": f"HTTP {exc.code}"}
        except Exception as exc:  # noqa: BLE001
            return {"__error__": str(exc)}
    return {"__error__": "gave up after retries"}


def describe(dataset: str) -> dict:
    """Licence, gating and column list. All published facts, not measurements."""
    meta = get_json(f"{HF_API}/{urllib.parse.quote(dataset, safe='/')}") or {}
    info = get_json(f"{BASE}/info?dataset={urllib.parse.quote(dataset)}") or {}

    columns: list[str] = []
    config_name = None
    if "dataset_info" in info:
        first = next(iter(info["dataset_info"].items()), None)
        if first:
            config_name, cfg = first
            columns = sorted(cfg.get("features", {}).keys())

    size = get_json(f"{BASE}/size?dataset={urllib.parse.quote(dataset)}") or {}
    rows = None
    if "size" in size:
        rows = size["size"].get("dataset", {}).get("num_rows")

    return {
        "dataset": dataset,
        "license": (meta.get("cardData") or {}).get("license") or meta.get("license"),
        "gated": meta.get("gated"),
        "rows": rows,
        "config": config_name,
        "columns": columns,
        "hasBrandColumn": any("brand" in c.lower() for c in columns),
        "error": meta.get("__error__") or info.get("__error__"),
    }


def extract_prompt(value: object) -> str | None:
    """
    Pull the first user prompt out of a column.

    Plain string columns are the easy case. Arena nests two levels: a list of turns,
    each turn's content itself a list of content parts carrying a 'text' key. Reading
    it as a string returns nothing, which is why an earlier pass reported zero rows.
    """
    if isinstance(value, str):
        return value.strip() or None

    if not isinstance(value, list):
        return None

    for turn in value:
        if not isinstance(turn, dict) or turn.get("role") != "user":
            continue
        content = turn.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()
        if isinstance(content, list):
            parts = [
                p.get("text")
                for p in content
                if isinstance(p, dict) and isinstance(p.get("text"), str)
            ]
            joined = " ".join(p for p in parts if p).strip()
            if joined:
                return joined
    return None


def sample_text(dataset: str, config: str | None, split: str, field: str, pages: int) -> list[str]:
    out: list[str] = []
    for i in range(pages):
        params = {"dataset": dataset, "split": split, "offset": i * 100, "length": 100}
        if config:
            params["config"] = config
        page = get_json(f"{BASE}/rows?{urllib.parse.urlencode(params)}")
        if not page or "rows" not in page:
            break
        for r in page["rows"]:
            text = extract_prompt(r["row"].get(field))
            if text:
                out.append(text)
        time.sleep(0.3)
    return out


def pick_text_field(columns: list[str]) -> str | None:
    for candidate in ("query", "prompt", "question", "conversation_a", "instruction", "text"):
        if candidate in columns:
            return candidate
    return None


def screen(spec: dict, pages: int) -> dict:
    print(f"  {spec['id']}")
    desc = describe(spec["id"])
    if desc.get("error"):
        print(f"      unavailable: {desc['error']}")
        desc["intentPct"] = None
        desc["sampled"] = 0
        return desc

    print(f"      licence={desc['license']} gated={desc['gated']} rows={desc['rows']}")
    print(f"      brand column present: {desc['hasBrandColumn']}")

    field = spec["text_field"] or pick_text_field(desc["columns"])
    if not field:
        print(f"      no usable text column among {desc['columns'][:6]}")
        desc["intentPct"] = None
        desc["sampled"] = 0
        desc["textField"] = None
        return desc

    texts = sample_text(spec["id"], desc["config"], spec["split"], field, pages)
    if not texts:
        print("      no rows retrieved")
        desc["intentPct"] = None
        desc["sampled"] = 0
        desc["textField"] = field
        return desc

    hits = [t for t in texts if INTENT.search(t)]
    branded = [t for t in hits if CAPITALISED.search(t)]

    desc["textField"] = field
    desc["sampled"] = len(texts)
    desc["intentHits"] = len(hits)
    desc["intentPct"] = round(len(hits) / len(texts) * 100, 2)
    desc["intentWithProperNounPct"] = round(len(branded) / len(texts) * 100, 2)
    desc["examples"] = [t[:110] for t in hits[:3]]

    print(f"      sampled {len(texts)} prompts from '{field}'")
    print(f"      recommendation intent: {desc['intentPct']}%")
    return desc


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pages", type=int, default=20, help="pages of 100 rows per corpus")
    ap.add_argument("--out", default="../dashboard/public/data")
    args = ap.parse_args()

    print("screening candidate corpora\n")
    results = [screen(spec, args.pages) for spec in CANDIDATES]

    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "intentPattern": INTENT.pattern,
        "note": (
            "Licence, gating, row counts and column lists are published facts read from "
            "the Hugging Face API. Intent percentages are measured here with the regex "
            "above over a sampled prefix of each corpus, and are not published statistics. "
            "The decisive test is the brand column, which is structural."
        ),
        "corpora": results,
    }

    out = pathlib.Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    path = out / "corpus_screen.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(f"\nwrote {path}")
    print(f"{'corpus':<46} {'brand col':>10} {'intent':>8} {'licence':>16}")
    for r in results:
        intent = f"{r['intentPct']}%" if r.get("intentPct") is not None else "n/a"
        print(
            f"  {r['dataset']:<44} {str(r['hasBrandColumn']):>10} {intent:>8} "
            f"{str(r.get('license')):>16}"
        )


if __name__ == "__main__":
    main()
