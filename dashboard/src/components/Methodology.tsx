import { LABEL_MEANING, LABEL_ORDER } from '@/lib/metrics';
import type { Meta, Totals } from '@/lib/schema';

import { Disclosure, LabelBadge } from './ui';

/**
 * Method, caveats and data-quality findings.
 *
 * Collapsed by default and placed after the data. It all matters, but leading with
 * it buries the thing a reader came for. Each summary states what is inside so
 * skipping it is an informed choice.
 */

export function Methodology({ meta, totals }: { meta: Meta; totals: Totals }) {
  const labelTotal = LABEL_ORDER.reduce((s, l) => s + (totals.labelDistribution[l] ?? 0), 0);

  return (
    <section id="method" className="flex scroll-mt-24 flex-col gap-4">
      <h2 className="text-xl font-semibold tracking-tight">Method and caveats</h2>

      <Disclosure
        summary="The four judgements"
        hint="What Exact, Substitute, Complement and Irrelevant mean"
      >
        <ul className="flex flex-col gap-2">
          {LABEL_ORDER.map((label) => {
            const count = totals.labelDistribution[label] ?? 0;
            const pct = labelTotal ? Math.round((count / labelTotal) * 1000) / 10 : 0;
            return (
              <li key={label} className="flex items-center gap-3">
                <span className="w-24 shrink-0">
                  <LabelBadge label={label} />
                </span>
                <span className="flex-1 text-xs text-neutral-600 dark:text-neutral-400">
                  {LABEL_MEANING[label]}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                  {pct}%
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          A human rated every product against the query intent. Exact is the ground truth a
          recommendation would be scored against.
        </p>
      </Disclosure>

      <Disclosure
        summary="Brand column defects"
        hint={`${totals.brandsWithVariants} split spellings, ${totals.suspectBrands} product titles, ${totals.nonLatinBrands} unresolved aliases`}
      >
        <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          Four defects, each handled in the numbers above.
        </p>
        <ul className="flex flex-col gap-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">
              {totals.brandsWithVariants.toLocaleString()} brands carried multiple spellings
            </strong>{' '}
            and were collapsed into one record. <span className="font-mono">1MORE</span> and{' '}
            <span className="font-mono">1More</span> are one company. Left split they divide the
            ground-truth set, which understates recall before a model is even involved.
          </li>
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">
              {totals.suspectBrands.toLocaleString()} entries are product titles
            </strong>
            , not brands, because some sellers fill the field with keywords. Flagged rather than
            deleted, and excluded by default.{' '}
            {totals.suspectAndVariant > 0 && (
              <>
                {totals.suspectAndVariant} of them also carried split spellings, so these two counts
                overlap.
              </>
            )}
          </li>
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">
              {totals.nonLatinBrands.toLocaleString()} entries are aliases that could not be resolved.
            </strong>{' '}
            A name written in another script with a romanisation in brackets resolves cleanly, so{' '}
            <span className="font-mono">{'\u30b3\u30fc\u30eb\u30de\u30f3(Coleman)'}</span> folds into{' '}
            <span className="font-mono">Coleman</span>. A bare one does not:{' '}
            <span className="font-mono">{'\u30ad\u30e4\u30ce\u30f3'}</span> is Canon, but there is
            nothing to key on without an alias table. They are excluded from the substitute graph,
            where they would otherwise read as a brand competing with itself, and left in the brand
            list.
          </li>
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">
              Only {totals.establishedBrands.toLocaleString()} of{' '}
              {totals.distinctBrands.toLocaleString()} brands appear against three or more queries.
            </strong>{' '}
            The usable brand universe is{' '}
            {Math.round((totals.establishedBrands / totals.distinctBrands) * 100)}% of the raw count.
            The remainder are one-off marketplace sellers.
          </li>
        </ul>
        <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          The substitute graph is where these surface. Uncleaned, the strongest rivalries are companies
          paired with themselves: <span className="font-mono">1MORE / 1More</span>,{' '}
          <span className="font-mono">Coleman / {'\u30b3\u30fc\u30eb\u30de\u30f3(Coleman)'}</span>,{' '}
          <span className="font-mono">Canon / {'\u30ad\u30e4\u30ce\u30f3'}</span>.
        </p>
      </Disclosure>

      <Disclosure
        summary="Limits"
        hint="Temporal mismatch is the one that can invalidate a result outright"
      >
        <ul className="flex flex-col gap-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">Temporal mismatch.</strong>{' '}
            The judgements predate the paper&apos;s publication in June 2022. Model responses are
            current, so a model naming a 2025 product this dataset never saw is a dataset gap, not a
            model error. The paper states no collection window, so publication date is the only firm
            upper bound.
          </li>
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">
              Relevance is not market share.
            </strong>{' '}
            Exact means the product matched the query intent, not that it sells well. A brand can be
            relevant and obscure.
          </li>
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">
              Near-duplicate queries.
            </strong>{' '}
            The sample holds several variants of the same search, so a print-on-demand seller can
            clear a three-query threshold without being recognisable in any ordinary sense.
            Deduplicating by query stem would fix this and has not been done.
          </li>
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">
              Amazon-shaped intent.
            </strong>{' '}
            These are product searches, not open-ended advice questions, so findings apply to
            purchase-adjacent prompts.
          </li>
        </ul>
      </Disclosure>

      <Disclosure summary="Sampling and source" hint={`${meta.dataset}, ${meta.license}`}>
        <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          {meta.note}
        </p>
        <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          {meta.citation}. Generated {meta.generatedAt.slice(0, 10)} from a {meta.samplePct}% sample
          of {meta.corpusRows.toLocaleString()} rows. Aggregates are precomputed and committed, both
          because the source API rate-limits anonymous access and because frozen numbers stay
          citable.
        </p>
      </Disclosure>
    </section>
  );
}
