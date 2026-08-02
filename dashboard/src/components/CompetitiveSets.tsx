'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { filterSets, labelMix, LABEL_MEANING, setSizeHistogram } from '@/lib/metrics';
import type { CompetitiveSet } from '@/lib/schema';

import { Disclosure, FigureStrip, LabelBadge, Notice, Pill, SearchInput, Section } from './ui';

/**
 * Browse human-labelled competitive sets.
 *
 * The list and detail panel are the point of this section, so they get the space.
 * Two controls rather than four: searching, and how many recognisable brands a set
 * must contain. Raw brand count was dropped because the recognisable count already
 * subsumes it, and filtering by label was dropped because it added a row of buttons
 * for a question nobody asks first.
 */

const ESTABLISHED_CHOICES = [
  { value: 3, label: 'Mostly known brands', hint: '3 or more recognisable brands' },
  { value: 2, label: 'Some known brands', hint: '2 or more recognisable brands' },
  { value: 0, label: 'Everything', hint: 'Includes sets made only of one-off sellers' },
];

export function CompetitiveSets({ sets }: { sets: CompetitiveSet[] }) {
  const [minEstablished, setMinEstablished] = useState(3);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterSets(sets, { search, minEstablished }),
    [sets, search, minEstablished]
  );

  const mix = useMemo(() => labelMix(filtered), [filtered]);
  const histogram = useMemo(() => setSizeHistogram(filtered), [filtered]);

  const active = useMemo(
    () => filtered.find((s) => s.query === selected) ?? filtered[0] ?? null,
    [filtered, selected]
  );

  const exactPct = mix.find((m) => m.label === 'Exact')?.pct ?? 0;
  const subPct = mix.find((m) => m.label === 'Substitute')?.pct ?? 0;

  return (
    <Section
      id="sets"
      title="Competitive sets"
      description="Each query is one shopper search with every brand judged against it."
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <SearchInput
          label="Search query or brand"
          value={search}
          onChange={setSearch}
          placeholder="charging dock"
        />

        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Show sets with
          </span>
          <div className="flex flex-wrap gap-2">
            {ESTABLISHED_CHOICES.map((choice) => (
              <Pill
                key={choice.value}
                active={minEstablished === choice.value}
                onClick={() => setMinEstablished(choice.value)}
              >
                {choice.label}
              </Pill>
            ))}
          </div>
        </div>
      </div>

      {minEstablished === 0 && (
        <Notice tone="warn">
          Includes sets made entirely of single-appearance marketplace sellers.
        </Notice>
      )}

      <FigureStrip
        items={[
          {
            value: filtered.length.toLocaleString(),
            label: `sets shown of ${sets.length.toLocaleString()}`,
          },
          { value: `${exactPct}%`, label: 'judged Exact' },
          { value: `${subPct}%`, label: 'judged Substitute' },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">
            Queries{' '}
            <span className="font-normal text-neutral-500 dark:text-neutral-400">
              (showing {Math.min(filtered.length, 60)})
            </span>
          </h3>
          <ul className="max-h-[26rem] divide-y divide-neutral-100 overflow-y-auto rounded-xl border border-neutral-200 dark:divide-neutral-800/60 dark:border-neutral-800">
            {filtered.slice(0, 60).map((s) => {
              const isActive = active?.query === s.query;
              return (
                <li key={s.query}>
                  <button
                    type="button"
                    onClick={() => setSelected(s.query)}
                    aria-current={isActive}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-950/40'
                        : 'hover:bg-neutral-50 dark:hover:bg-neutral-900/50'
                    }`}
                  >
                    <span
                      className={`truncate font-mono text-[13px] ${
                        isActive ? 'text-blue-900 dark:text-blue-200' : ''
                      }`}
                    >
                      {s.query}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                      {s.establishedBrands} known
                    </span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-3 py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
                Nothing matches. Try a broader setting.
              </li>
            )}
          </ul>
        </div>

        {active && (
          <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Judged against
              </p>
              <h3 className="font-mono text-base font-semibold">{active.query}</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {active.brandCount} brands, {active.establishedBrands} recognisable, across{' '}
                {active.products} judged products
              </p>
            </div>
            <ul className="flex max-h-72 flex-col divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-800/60">
              {active.brands.map((b) => (
                <li key={b.brand} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`truncate text-sm ${
                        b.established ? 'font-medium' : 'text-neutral-500 dark:text-neutral-400'
                      }`}
                    >
                      {b.brand}
                    </span>
                    {!b.established && (
                      <span
                        title="Seen against fewer than three queries in this sample"
                        className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                      >
                        one-off
                      </span>
                    )}
                  </span>
                  <LabelBadge label={b.label} title={LABEL_MEANING[b.label]} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Disclosure
        summary="How crowded are these sets?"
        hint="Distribution of brand counts under the current filter"
      >
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogram} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-neutral-200 dark:stroke-neutral-800"
                vertical={false}
              />
              <XAxis
                dataKey="size"
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                className="text-neutral-500"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                className="text-neutral-500"
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v) => [Number(v).toLocaleString(), 'queries']}
                labelFormatter={(l) => `${l} brands`}
              />
              <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </Disclosure>
    </Section>
  );
}
