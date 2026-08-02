'use client';

import { useMemo, useState } from 'react';

import { topRivalries } from '@/lib/metrics';
import type { SubstitutePair } from '@/lib/schema';

import { Notice, SearchInput, Section, StatCard } from './ui';

/**
 * Human-labelled competitor map.
 *
 * When two brands are both judged Substitute on the same query, raters were
 * saying they are interchangeable for that intent. Commercial tools infer
 * competitor sets from co-mention in text; here the relationship is labelled, so
 * it is evidence rather than inference.
 */

export function SubstituteGraph({ pairs }: { pairs: SubstitutePair[] }) {
  const [search, setSearch] = useState('');

  const rivalries = useMemo(() => topRivalries(pairs, 24), [pairs]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rivalries;
    return rivalries.filter(
      (r) =>
        r.brand.toLowerCase().includes(needle) ||
        r.rivals.some((v) => v.brand.toLowerCase().includes(needle))
    );
  }, [rivalries, search]);

  const strongest = pairs[0];
  const maxPairings = rivalries[0]?.totalPairings ?? 1;

  return (
    <Section
      id="substitutes"
      title="Substitute relationships"
      description="Two brands judged Substitute on the same query were treated as interchangeable for that intent. Read across the sample, those pairs form a competitor map from human judgement rather than inferred from co-mention."
    >
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pairs recorded" value={pairs.length.toLocaleString()} accent />
        <StatCard label="Brands with rivals" value={rivalries.length.toLocaleString()} />
        <StatCard
          label="Strongest pair"
          value={strongest ? strongest.count : 0}
          hint={strongest ? `${strongest.a} and ${strongest.b}` : undefined}
        />
        <StatCard
          label="Total pairings"
          value={pairs.reduce((s, p) => s + p.count, 0).toLocaleString()}
        />
      </dl>

      <SearchInput label="Brand" value={search} onChange={setSearch} placeholder="Anker" />

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          No substitute relationships match that brand.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {filtered.map((r) => (
            <li
              key={r.brand}
              className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="truncate text-sm font-semibold">{r.brand}</h3>
                <span className="shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                  {r.totalPairings} pairings
                </span>
              </div>
              <span
                aria-hidden
                className="h-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
              >
                <span
                  className="block h-full rounded-full bg-amber-500 transition-[width] duration-500"
                  style={{ width: `${(r.totalPairings / maxPairings) * 100}%` }}
                />
              </span>
              <ul className="flex flex-wrap gap-1.5">
                {r.rivals.map((v) => (
                  <li
                    key={v.brand}
                    className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800/70"
                  >
                    <span className="truncate">{v.brand}</span>
                    <span className="tabular-nums text-neutral-500 dark:text-neutral-400">
                      {v.count}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <Notice>
        Counts come from the sample, not the full corpus, so they are directional. The relationship is
        the useful part: these brands were judged interchangeable by people.
      </Notice>
    </Section>
  );
}
