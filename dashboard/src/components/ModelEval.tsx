'use client';

import { useMemo, useState } from 'react';

import type { ModelEval } from '@/lib/schema';

import { DataTable, type Column } from './DataTable';
import { Disclosure, FigureStrip, Notice, Section } from './ui';

/**
 * Phase 2: a model's recommendations scored against the ground truth.
 *
 * The framing guards against one misreading. The model names far more brands than
 * ESCI judged per query, so raw precision and off-corpus rate look alarming and
 * mostly reflect ESCI's narrow coverage, not model error. The honest metrics are
 * recall against the Exact set, leader capture, and precision measured only over
 * the brands ESCI actually judged.
 */

function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}

export function ModelEval({ data }: { data: ModelEval }) {
  const a = data.aggregate;
  const [onlyMisses, setOnlyMisses] = useState(false);

  const rows = useMemo(
    () => (onlyMisses ? data.perQuery.filter((r) => (r.recall ?? 0) === 0) : data.perQuery),
    [data.perQuery, onlyMisses]
  );

  const columns: Column<(typeof data.perQuery)[number]>[] = [
    {
      key: 'query',
      header: 'Query',
      cell: (r) => <span className="font-mono text-[13px]">{r.query}</span>,
      sortValue: (r) => r.query,
    },
    {
      key: 'namedCount',
      header: 'Named',
      cell: (r) => r.namedCount,
      sortValue: (r) => r.namedCount,
      align: 'right',
      hideOnMobile: true,
    },
    {
      key: 'inCorpusCount',
      header: 'Judged by ESCI',
      cell: (r) => r.inCorpusCount,
      sortValue: (r) => r.inCorpusCount,
      align: 'right',
      hideOnMobile: true,
    },
    {
      key: 'recall',
      header: 'Recall',
      cell: (r) => pct(r.recall),
      sortValue: (r) => r.recall ?? -1,
      align: 'right',
    },
    {
      key: 'precisionInCorpus',
      header: 'Precision (judged)',
      cell: (r) => pct(r.precisionInCorpus),
      sortValue: (r) => r.precisionInCorpus ?? -1,
      align: 'right',
    },
    {
      key: 'leaderCaptured',
      header: 'Leader',
      cell: (r) =>
        r.leaderCaptured === null ? (
          '—'
        ) : r.leaderCaptured ? (
          <span className="text-emerald-600 dark:text-emerald-400">hit</span>
        ) : (
          <span className="text-neutral-400">miss</span>
        ),
      sortValue: (r) => (r.leaderCaptured ? 1 : 0),
      align: 'right',
    },
  ];

  return (
    <Section
      id="model"
      title="Phase 2: scoring a model against the ground truth"
      description={`I put each competitive query to ${data.model} with no tools or web search, then matched the brands it named against the human judgements. ${data.queries} queries.`}
    >
      <FigureStrip
        items={[
          { value: pct(a.recall), label: 'recall of the Exact set' },
          { value: pct(a.leaderCaptureRate), label: 'named the leading brand' },
          {
            value: pct(a.precisionInCorpus),
            label: 'precision among judged brands',
            title: 'Of the named brands ESCI actually judged, the share labelled Exact',
          },
          { value: pct(a.substituteRate), label: 'substitutes offered' },
        ]}
      />

      <Notice tone="warn">
        The model named {a.meanNamed} brands per query on average, but ESCI had judged only{' '}
        {a.meanInCorpus} of them. So the {pct(a.offCorpusRate)} off-corpus rate is mostly real brands
        outside ESCI&apos;s coverage, not inventions, and raw precision ({pct(a.precision)}) is low for
        the same reason. Precision among the brands ESCI did judge is {pct(a.precisionInCorpus)}.
      </Notice>

      <p className="max-w-3xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        Read together: when the model names a brand ESCI also judged, it is usually right
        ({pct(a.precisionInCorpus)} Exact). It recovers {pct(a.recall)} of the full Exact set and names
        the single leading brand {pct(a.leaderCaptureRate)} of the time. The model is accurate on the
        overlap and incomplete against the whole set.
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOnlyMisses((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors ${
            onlyMisses
              ? 'bg-blue-600 text-white ring-blue-600'
              : 'bg-white text-neutral-600 ring-neutral-300 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-400 dark:ring-neutral-700'
          }`}
        >
          {onlyMisses ? 'Showing zero-recall queries' : 'Show only zero-recall queries'}
        </button>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {rows.length} of {data.perQuery.length}
        </span>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.query}
        initialSort="recall"
        pageSize={15}
        caption="Per-query model scores against ESCI judgements"
      />

      <Disclosure summary="Method and metrics" hint={`${data.model}, no tools, ${data.queries} queries`}>
        <ul className="flex flex-col gap-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">Recall.</strong> Share of the
            query&apos;s Exact-labelled brands the model named.
          </li>
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">Precision (judged).</strong> Of
            the named brands ESCI judged, the share labelled Exact. This is the fair precision, since
            it ignores brands ESCI never covered.
          </li>
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">Leader.</strong> Whether the
            model named the Exact brand with the most judgements in the dataset.
          </li>
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">Off-corpus.</strong> Named
            brands ESCI never judged for the query. Includes products released after ESCI and brands
            outside its results, so it is not a hallucination rate.
          </li>
        </ul>
        <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          Brands are matched to ESCI by normalised name. The run cost about ${data.estCostUsd} in API
          usage. Generated {data.generatedAt.slice(0, 10)}.
        </p>
      </Disclosure>
    </Section>
  );
}
