import { BrandExplorer } from '@/components/BrandExplorer';
import { CompetitiveSets } from '@/components/CompetitiveSets';
import { Hero } from '@/components/Hero';
import { Methodology } from '@/components/Methodology';
import { SubstituteGraph } from '@/components/SubstituteGraph';
import { VoiceVsAgreement } from '@/components/VoiceVsAgreement';
import { loadEsciData } from '@/lib/data';

/**
 * Server component: reads and validates the precomputed data once at build time,
 * then hands typed slices to the interactive views. No client-side fetching, so
 * there is no loading state and no rate limit to hit.
 *
 * Order is deliberate. A worked example first, then the three ways to explore,
 * then method and caveats. Leading with methodology buried the thing a reader came
 * for.
 */

const NAV = [
  { href: '#start', label: 'Start here' },
  { href: '#voice', label: 'Voice vs agreement' },
  { href: '#sets', label: 'Competitive sets' },
  { href: '#brands', label: 'Brands' },
  { href: '#substitutes', label: 'Substitutes' },
  { href: '#method', label: 'Method' },
];

export default async function Page() {
  const data = await loadEsciData();

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <p className="text-sm font-semibold tracking-tight">
              ESCI brand study
              <span className="ml-2 font-normal text-neutral-500 dark:text-neutral-400">
                ground truth for measuring AI recommendations
              </span>
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {data.meta.sampledRows.toLocaleString()} human relevance judgements
            </p>
          </div>
          <nav aria-label="Sections" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-16 px-6 py-10">
        <Hero meta={data.meta} totals={data.totals} sets={data.competitiveSets} />
        <VoiceVsAgreement brands={data.brands} sensitivity={data.voiceVsAgreement} />
        <CompetitiveSets sets={data.competitiveSets} />
        <BrandExplorer brands={data.brands} />
        <SubstituteGraph pairs={data.substitutePairs} />
        <Methodology meta={data.meta} totals={data.totals} />

        <section className="flex flex-col gap-3 border-t border-neutral-200 pt-8 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Next</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            Put these queries to a model and score the answers against the judgements: recall against
            the Exact set, precision, substitute rate, and how often it names a brand nobody judged.
            The last of those is the hard one, since a genuine invention and a product released after
            2022 look identical from here.
          </p>
        </section>
      </main>

      <footer className="border-t border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-neutral-500 dark:text-neutral-400">
          <p>
            Data: <span className="font-mono">{data.meta.dataset}</span> ({data.meta.license}).{' '}
            {data.meta.citation}.
          </p>
          <p className="mt-1">
            Aggregates precomputed from a {data.meta.samplePct}% sample, US locale, generated{' '}
            {data.meta.generatedAt.slice(0, 10)}. Numbers are frozen at build time so they stay
            citable.
          </p>
        </div>
      </footer>
    </div>
  );
}
