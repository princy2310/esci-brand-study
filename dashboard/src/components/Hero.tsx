import { LABEL_MEANING } from '@/lib/metrics';
import type { CompetitiveSet, Meta, Totals } from '@/lib/schema';

import { FigureStrip, LabelBadge } from './ui';

/**
 * Opening.
 *
 * One worked example does more than a methodology section: read a single query
 * with its judgements and the whole dataset becomes obvious. The example is picked
 * from the data rather than hardcoded, so it survives regeneration.
 *
 * The headline deliberately does not ask whether models recommend the right
 * brands. Phase 1 has no model in it, and a page that poses a question it cannot
 * answer leaves the reader hunting for something that is not there.
 */

function pickExample(sets: CompetitiveSet[]): CompetitiveSet | null {
  // Prefer a set that teaches the label system: several recognisable brands, and
  // at least one Exact and one Substitute so the distinction is visible.
  const teaches = sets.filter((s) => {
    const known = s.brands.filter((b) => b.established);
    return (
      known.length >= 5 &&
      known.some((b) => b.label === 'Exact') &&
      known.some((b) => b.label === 'Substitute') &&
      s.query.length < 40
    );
  });
  return teaches[0] ?? sets[0] ?? null;
}

export function Hero({
  meta,
  totals,
  sets,
}: {
  meta: Meta;
  totals: Totals;
  sets: CompetitiveSet[];
}) {
  const example = pickExample(sets);
  const shown = example ? example.brands.filter((b) => b.established).slice(0, 7) : [];
  const hidden = example ? example.brandCount - shown.length : 0;

  return (
    <section id="start" className="flex scroll-mt-24 flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          Which brands did shoppers judge relevant?
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          AEO platforms report how often a brand appears in AI answers. Whether it belonged there is a
          separate question and needs ground truth. Amazon&apos;s ESCI supplies it:{' '}
          {meta.sampledRows.toLocaleString()} human relevance judgements across{' '}
          {totals.distinctQueries.toLocaleString()} shopper queries. No model involved.
        </p>
      </div>

      {example && (
        <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-neutral-50/50 p-5 dark:border-neutral-800 dark:bg-neutral-900/30">
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              One query, as the data holds it
            </p>
            <p className="font-mono text-base font-semibold">{example.query}</p>
          </div>

          <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
            {shown.map((b) => (
              <li key={b.brand} className="flex items-center justify-between gap-4 py-2">
                <span className="truncate text-sm font-medium">{b.brand}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="hidden text-xs text-neutral-500 sm:inline dark:text-neutral-400">
                    {LABEL_MEANING[b.label]}
                  </span>
                  <LabelBadge label={b.label} />
                </span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {hidden > 0 && <>Plus {hidden} lower-volume sellers not shown. </>}
            Exact brands are the target. Substitutes are near misses. Anything absent from this list
            is a dataset gap or an invention.
          </p>
        </div>
      )}

      <FigureStrip
        items={[
          {
            value: totals.distinctQueries.toLocaleString(),
            label: 'queries sampled',
            title: `${meta.samplePct}% of ${meta.corpusRows.toLocaleString()} rows, US locale`,
          },
          {
            value: totals.competitiveQueries.toLocaleString(),
            label: 'have competing brands',
            title: 'More than one brand judged against the same query',
          },
          {
            value: totals.establishedBrands.toLocaleString(),
            label: 'recognisable brands',
            title: `Seen against 3+ queries, out of ${totals.distinctBrands.toLocaleString()} total`,
          },
          {
            value: `${totals.brandsPerCompetitiveQuery.median}`,
            label: 'median brands per query',
          },
        ]}
      />
    </section>
  );
}
