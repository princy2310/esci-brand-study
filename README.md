# ESCI Brand Study

**Live dashboard: https://princy2310.github.io/esci-brand-study/**

Answer engine optimization tools measure brand visibility in AI answers: how often a brand is named,
its share of voice, its position. This study measures something adjacent and largely unreported,
whether those recommendations are correct. It builds a ground-truth benchmark from Amazon's Shopping
Queries Dataset (ESCI), where human raters labelled which brands are genuinely relevant to each
query, then ranks brands by agreement with those judgements rather than by presence alone.

Share of voice and agreement turn out to rank the same brands differently: a brand can lead on
visibility while raters consistently judged it a weak match, and the dashboard isolates those cases.
The result is a correctness baseline for AI product recommendations that sits alongside the
visibility metrics AEO and GEO platforms already track, and a foundation for scoring live model
answers against human ground truth.

## Prerequisites

- Node 20+
- Python 3.10+ (only to regenerate the dataset aggregates)

## Getting started

```bash
cd dashboard
npm install
npm run dev
```

Open http://localhost:3000.

To regenerate the aggregates (output is committed, so this is optional):

```bash
cd scripts
python3 precompute.py --rows 20000 --locale us --out ../dashboard/public/data
```

## Views

- Share of voice against agreement
- Competitive sets per query
- Brand breadth against exact-match rate
- Substitute graph

## Structure

```
scripts/
  precompute.py      samples ESCI, writes esci.json
  corpus_screen.py   writes corpus_screen.json
  verify.py          data checks
dashboard/src/
  lib/               schema, data loader, metrics
  components/        dashboard views
```

## Dataset

[`tasksource/esci`](https://huggingface.co/datasets/tasksource/esci), Apache-2.0. This build uses the
US slice.

Reddy et al., *Shopping Queries Dataset: A Large-Scale ESCI Benchmark for Improving Product Search*,
[arXiv:2206.06588](https://arxiv.org/abs/2206.06588).
