'use client';

import { useMemo, useState } from 'react';

import { rankCorrelation, rankDivergence } from '@/lib/metrics';
import type { Brand, VoiceVsAgreementData } from '@/lib/schema';

import { DataTable, type Column } from './DataTable';
import { Disclosure, FigureStrip, Notice, Pill, Section } from './ui';

/**
 * The comparison the study exists to make.
 *
 * Share of voice is the metric the commercial AEO platforms report, and it is a
 * presence measure. Agreement with the human judgements is a correctness measure.
 * Ranking the same brands both ways shows where a presence-based report and a
 * correctness-based one would disagree about the same underlying data.
 */

type View = 'overrated' | 'underrated' | 'all';

const VIEWS: { value: View; label: string }[] = [
  { value: 'overrated', label: 'Louder than they are right' },
  { value: 'underrated', label: 'Better than they look' },
  { value: 'all', label: 'Largest gaps either way' },
];

export function VoiceVsAgreement({
  brands,
  sensitivity,
}: {
  brands: Brand[];
  sensitivity: VoiceVsAgreementData;
}) {
  const [view, setView] = useState<View>('overrated');

  const rows = useMemo(
    () => rankDivergence(brands, sensitivity.minJudgements, sensitivity.minQueries),
    [brands, sensitivity.minJudgements, sensitivity.minQueries]
  );
  const correlation = useMemo(() => rankCorrelation(rows), [rows]);

  const rhos = sensitivity.floors
    .map((f) => f.rho)
    .filter((r): r is number => r !== null);
  const maxAbsRho = rhos.length ? Math.max(...rhos.map(Math.abs)) : 0;

  const shown = useMemo(() => {
    if (view === 'overrated') return rows.filter((r) => r.gap > 0);
    if (view === 'underrated') return rows.filter((r) => r.gap < 0);
    return rows;
  }, [rows, view]);

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: 'brand',
      header: 'Brand',
      cell: (r) => <span className="font-medium">{r.brand}</span>,
      sortValue: (r) => r.brand,
    },
    {
      key: 'shareOfVoice',
      header: 'Share of voice',
      cell: (r) => (
        <span className="tabular-nums">
          {r.shareOfVoice}%{' '}
          <span className="text-neutral-400 dark:text-neutral-500">#{r.voiceRank}</span>
        </span>
      ),
      sortValue: (r) => r.shareOfVoice,
      align: 'right',
    },
    {
      key: 'exactRate',
      header: 'Agreement',
      cell: (r) => (
        <span className="tabular-nums">
          {r.exactRate}%{' '}
          <span className="text-neutral-400 dark:text-neutral-500">#{r.agreementRank}</span>
        </span>
      ),
      sortValue: (r) => r.exactRate,
      align: 'right',
    },
    {
      key: 'gap',
      header: 'Rank gap',
      cell: (r) => (
        <span
          className={`tabular-nums font-medium ${
            r.gap > 0
              ? 'text-amber-600 dark:text-amber-400'
              : r.gap < 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-neutral-400'
          }`}
        >
          {r.gap > 0 ? `+${r.gap}` : r.gap}
        </span>
      ),
      sortValue: (r) => r.gap,
      align: 'right',
    },
    {
      key: 'judgements',
      header: 'Judgements',
      cell: (r) => r.judgements.toLocaleString(),
      sortValue: (r) => r.judgements,
      align: 'right',
      hideOnMobile: true,
    },
  ];

  return (
    <Section
      id="voice"
      title="Share of voice against agreement"
      description="Share of voice measures how much of the query set a brand covers. Agreement measures how often raters judged it a match. The same brands rank differently under each."
    >
      <FigureStrip
        items={[
          { value: rows.length.toLocaleString(), label: 'brands ranked both ways' },
          {
            value: correlation > 0 ? `+${correlation}` : `${correlation}`,
            label: 'rank correlation',
            title: 'Spearman correlation between the share-of-voice and agreement orderings',
          },
          {
            value: rows.filter((r) => Math.abs(r.gap) > 50).length.toLocaleString(),
            label: 'move more than 50 places',
          },
        ]}
      />

      <Notice>
        Share of voice does not predict agreement. The correlation stays within{' '}
        {maxAbsRho.toFixed(2)} of zero at every threshold tested and changes sign with the floor.
      </Notice>

      <Disclosure
        summary="Breadth floor and sensitivity sweep"
        hint={`Without a floor the correlation reads ${sensitivity.floors[0]?.rho ?? 0}, which is an exposure artifact`}
      >
        <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          Agreement is not comparable across brands of different breadth. A brand judged against one
          query cannot be wrong, so it reaches 100% mechanically. Without a query floor those brands
          occupy the top of the agreement ordering and drive the correlation negative.
        </p>

        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full border-collapse text-xs">
            <caption className="sr-only">
              Rank correlation and count of perfect-agreement brands by minimum query floor
            </caption>
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-900/60">
                <th scope="col" className="px-3 py-2 text-left font-semibold">
                  Minimum queries
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Brands
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Correlation
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  At 100% agreement
                </th>
              </tr>
            </thead>
            <tbody>
              {sensitivity.floors.map((f) => (
                <tr
                  key={f.minQueries}
                  className={`border-b border-neutral-100 last:border-0 dark:border-neutral-800/60 ${
                    f.minQueries === sensitivity.minQueries
                      ? 'bg-blue-50/60 dark:bg-blue-950/25'
                      : ''
                  }`}
                >
                  <td className="px-3 py-1.5">
                    {f.minQueries}
                    {f.minQueries === sensitivity.minQueries && (
                      <span className="ml-2 text-[10px] text-blue-700 dark:text-blue-300">used</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{f.brands}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {f.rho === null ? 'n/a' : f.rho > 0 ? `+${f.rho}` : f.rho}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{f.perfectAgreement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          Mean agreement falls as breadth rises. Perfect scores collapse with it.
        </p>

        <ul className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
          {sensitivity.breadthBuckets.map((b) => (
            <li key={b.queries} className="flex items-baseline justify-between gap-4">
              <span>
                Brands on {b.queries} {b.queries === '1' ? 'query' : 'queries'}
                <span className="ml-2 text-neutral-400 dark:text-neutral-500">n={b.brands}</span>
              </span>
              <span className="tabular-nums">
                {b.meanAgreement}% mean agreement, {b.perfectPct}% at 100%
              </span>
            </li>
          ))}
        </ul>
      </Disclosure>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Show
        </span>
        <div className="flex flex-wrap gap-2">
          {VIEWS.map((v) => (
            <Pill key={v.value} active={view === v.value} onClick={() => setView(v.value)}>
              {v.label}
            </Pill>
          ))}
        </div>
      </div>

      <p className="max-w-3xl text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
        Positive gap: ranks higher on share of voice than on agreement. Negative: the reverse.
        Restricted to brands with {sensitivity.minJudgements}+ judgements across{' '}
        {sensitivity.minQueries}+ distinct queries.
      </p>

      <DataTable
        rows={shown}
        columns={columns}
        rowKey={(r) => r.brand}
        initialSort="gap"
        initialDirection={view === 'underrated' ? 'asc' : 'desc'}
        pageSize={15}
        caption="Brands ranked by share of voice against agreement with human judgements"
      />
    </Section>
  );
}
