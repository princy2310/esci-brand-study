# ESCI Brand Study

A dashboard over Amazon's Shopping Queries Dataset (ESCI) showing which brands human raters judged
relevant to each query.

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
