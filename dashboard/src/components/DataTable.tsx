'use client';

import { useMemo, useState, type ReactNode } from 'react';

/**
 * Generic sortable table.
 *
 * Columns declare how to render a cell and, optionally, how to sort it. Keeping
 * sort state here rather than in each view means the brand table and the rivalry
 * table share one implementation.
 */

export interface Column<T> {
  key: string;
  header: string;
  /** Cell renderer. */
  cell: (row: T) => ReactNode;
  /** Sort key. Omit to make the column unsortable. */
  sortValue?: (row: T) => number | string;
  align?: 'left' | 'right';
  /** Hide below the sm breakpoint to keep narrow screens readable. */
  hideOnMobile?: boolean;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Initial sort column key. */
  initialSort?: string;
  initialDirection?: 'asc' | 'desc';
  pageSize?: number;
  emptyMessage?: string;
  caption?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  initialDirection = 'desc',
  pageSize = 25,
  emptyMessage = 'Nothing matches the current filters.',
  caption,
}: Props<T>) {
  const [sortKey, setSortKey] = useState(initialSort ?? columns[0]?.key);
  const [direction, setDirection] = useState<'asc' | 'desc'>(initialDirection);
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const dir = direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, columns, sortKey, direction]);

  const visible = expanded ? sorted : sorted.slice(0, pageSize);

  const toggle = (key: string) => {
    if (key === sortKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDirection('desc');
    }
  };

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-900/60">
              {columns.map((col) => {
                const isSorted = col.key === sortKey;
                const ariaSort = isSorted
                  ? direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : undefined;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    } ${col.hideOnMobile ? 'hidden sm:table-cell' : ''}`}
                  >
                    {col.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggle(col.key)}
                        className={`inline-flex items-center gap-1 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100 ${
                          isSorted ? 'text-neutral-900 dark:text-neutral-100' : ''
                        }`}
                      >
                        {col.header}
                        <span aria-hidden className="text-[9px]">
                          {isSorted ? (direction === 'asc' ? '\u25b2' : '\u25bc') : '\u21c5'}
                        </span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50/70 dark:border-neutral-800/60 dark:hover:bg-neutral-900/40"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 ${col.align === 'right' ? 'text-right tabular-nums' : 'text-left'} ${
                      col.hideOnMobile ? 'hidden sm:table-cell' : ''
                    }`}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length > pageSize && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="self-start text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 hover:underline dark:text-blue-400"
        >
          {expanded
            ? `Show first ${pageSize}`
            : `Show all ${sorted.length.toLocaleString()} rows`}
        </button>
      )}
    </div>
  );
}
