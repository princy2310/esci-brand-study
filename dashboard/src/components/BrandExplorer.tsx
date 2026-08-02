'use client';

import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';

import {
  breadthVsFit,
  filterBrands,
  sortBrands,
  UNIVERSE_RULES,
  type BrandUniverse,
} from '@/lib/metrics';
import type { Brand } from '@/lib/schema';

import { DataTable, type Column } from './DataTable';
import { FigureStrip, Notice, Pill, RateBar, SearchInput, Section } from './ui';

/**
 * Brand-level view.
 *
 * The scatter carries the argument: breadth and fit are different things, and a
 * brand can appear against many queries while rarely being judged a match. Sorting
 * moved onto the table headers, so this section has two controls instead of four.
 */

const UNIVERSES: { value: BrandUniverse; label: string }[] = [
  { value: 'recognisable', label: 'Recognisable brands' },
  { value: 'all', label: 'Every brand string' },
];

export function BrandExplorer({ brands }: { brands: Brand[] }) {
  const [universe, setUniverse] = useState<BrandUniverse>('recognisable');
  const [search, setSearch] = useState('');

  const rules = UNIVERSE_RULES[universe];

  const filtered = useMemo(
    () => filterBrands(brands, { ...rules, search }),
    [brands, rules, search]
  );
  const sorted = useMemo(() => sortBrands(filtered, 'judgements'), [filtered]);
  const scatter = useMemo(
    () => breadthVsFit(filtered, rules.minJudgements),
    [filtered, rules.minJudgements]
  );

  const pooledExact = useMemo(() => {
    const totalJ = filtered.reduce((s, b) => s + b.judgements, 0);
    const totalE = filtered.reduce((s, b) => s + b.exact, 0);
    return totalJ ? Math.round((totalE / totalJ) * 1000) / 10 : 0;
  }, [filtered]);

  const broadest = useMemo(
    () => [...filtered].sort((a, b) => b.queries - a.queries)[0],
    [filtered]
  );

  const medianExact = useMemo(() => {
    if (scatter.length === 0) return 50;
    const rates = scatter.map((p) => p.exactRate).sort((a, b) => a - b);
    return rates[Math.floor(rates.length / 2)];
  }, [scatter]);

  const medianQueries = useMemo(() => {
    if (scatter.length === 0) return 1;
    const q = scatter.map((p) => p.queries).sort((a, b) => a - b);
    return q[Math.floor(q.length / 2)];
  }, [scatter]);

  const columns: Column<Brand>[] = [
    {
      key: 'brand',
      header: 'Brand',
      cell: (b) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{b.brand}</span>
          {b.variants > 1 && (
            <span
              title={`${b.variants} spellings collapsed into this record`}
              className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
            >
              {b.variants} spellings
            </span>
          )}
          {b.suspect && (
            <span
              title="Looks like a product title rather than a brand"
              className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
            >
              title-like
            </span>
          )}
          {b.nonLatin && (
            <span
              title="Non-Latin script with no romanisation, so it could not be folded into its Latin-script counterpart"
              className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
            >
              unresolved alias
            </span>
          )}
        </span>
      ),
      sortValue: (b) => b.brand,
    },
    {
      key: 'queries',
      header: 'Queries',
      cell: (b) => b.queries.toLocaleString(),
      sortValue: (b) => b.queries,
      align: 'right',
    },
    {
      key: 'judgements',
      header: 'Judgements',
      cell: (b) => b.judgements.toLocaleString(),
      sortValue: (b) => b.judgements,
      align: 'right',
    },
    {
      key: 'exact',
      header: 'Exact',
      cell: (b) => b.exact.toLocaleString(),
      sortValue: (b) => b.exact,
      align: 'right',
      hideOnMobile: true,
    },
    {
      key: 'exactRate',
      header: 'Exact rate',
      cell: (b) => <RateBar value={b.exactRate} />,
      sortValue: (b) => b.exactRate,
      align: 'right',
    },
  ];

  return (
    <Section
      id="brands"
      title="Breadth against agreement"
      description="Breadth is how many queries a brand appears against. Agreement is how often raters judged it a match. The two move independently."
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <SearchInput label="Search brand" value={search} onChange={setSearch} placeholder="Anker" />

        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Which brands
          </span>
          <div className="flex flex-wrap gap-2">
            {UNIVERSES.map((u) => (
              <Pill key={u.value} active={universe === u.value} onClick={() => setUniverse(u.value)}>
                {u.label}
              </Pill>
            ))}
          </div>
        </div>
      </div>

      {universe === 'all' && (
        <Notice tone="warn">
          All {brands.length.toLocaleString()} strings, including one-off sellers, product titles and
          unresolved aliases. Most are not brands a model could reasonably be expected to name.
        </Notice>
      )}

      <FigureStrip
        items={[
          {
            value: filtered.length.toLocaleString(),
            label: `brands shown of ${brands.length.toLocaleString()}`,
          },
          { value: `${pooledExact}%`, label: 'judged Exact overall' },
          {
            value: broadest ? broadest.queries.toLocaleString() : '0',
            label: `widest breadth${broadest ? ` (${broadest.brand})` : ''}`,
          },
        ]}
      />

      <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Breadth against exact rate</h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            One circle per brand, sized by judgement count. Dashed lines mark the medians.
          </p>
        </div>

        <div className="relative h-72 w-full">
          {/* Quadrant labels sit on the chart so it reads without a legend. */}
          <span className="pointer-events-none absolute left-14 top-2 z-[1] text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
            narrow but usually right
          </span>
          <span className="pointer-events-none absolute right-3 top-2 z-[1] text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            broad and usually right
          </span>
          <span className="pointer-events-none absolute bottom-10 right-3 z-[1] text-[10px] font-medium text-amber-600 dark:text-amber-400">
            broad but rarely right
          </span>

          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 16, bottom: 24, left: -8 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-neutral-200 dark:stroke-neutral-800"
              />
              <XAxis
                type="number"
                dataKey="queries"
                name="Queries"
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                className="text-neutral-500"
                label={{
                  value: 'Distinct queries it appears against',
                  position: 'insideBottom',
                  offset: -14,
                  fontSize: 11,
                }}
              />
              <YAxis
                type="number"
                dataKey="exactRate"
                name="Exact rate"
                domain={[0, 100]}
                unit="%"
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                className="text-neutral-500"
              />
              <ZAxis type="number" dataKey="judgements" range={[36, 300]} name="Judgements" />
              <ReferenceLine y={medianExact} strokeDasharray="4 4" className="stroke-neutral-400" />
              <ReferenceLine
                x={medianQueries}
                strokeDasharray="4 4"
                className="stroke-neutral-400"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as {
                    brand: string;
                    queries: number;
                    exactRate: number;
                    judgements: number;
                  };
                  return (
                    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                      <p className="font-semibold">{p.brand}</p>
                      <p className="text-neutral-600 dark:text-neutral-400">
                        Appears against {p.queries.toLocaleString()} queries
                      </p>
                      <p className="text-neutral-600 dark:text-neutral-400">
                        {p.exactRate}% of its {p.judgements.toLocaleString()} judgements were Exact
                      </p>
                    </div>
                  );
                }}
              />
              <Scatter data={scatter} fill="#2563eb" fillOpacity={0.5} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Click any column heading to sort.
        </p>
        <DataTable
          rows={sorted}
          columns={columns}
          rowKey={(b) => b.brand}
          initialSort="judgements"
          pageSize={15}
          caption="Brand judgement counts and exact rates"
        />
      </div>
    </Section>
  );
}
