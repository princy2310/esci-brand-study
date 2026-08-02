import type { ReactNode } from 'react';

import type { Label } from '@/lib/schema';

/** Shared presentational primitives. */

export const LABEL_TONE: Record<Label, string> = {
  Exact: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900',
  Substitute: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900',
  Complement: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-900',
  Irrelevant: 'bg-neutral-100 text-neutral-500 ring-neutral-200 dark:bg-neutral-800/60 dark:text-neutral-400 dark:ring-neutral-700',
};

export function LabelBadge({ label, title }: { label: Label; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${LABEL_TONE[label]}`}
    >
      {label}
    </span>
  );
}

export function Section({
  id,
  title,
  description,
  note,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="max-w-3xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            {description}
          </p>
        )}
      </div>
      {note}
      {children}
    </section>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn';
  children: ReactNode;
}) {
  const tones = {
    info: 'border-neutral-200 bg-neutral-50/80 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-300',
    warn: 'border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200',
  } as const;
  return <p className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</p>;
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-xl border p-4 transition-colors ${
        accent
          ? 'border-blue-200 bg-blue-50/50 dark:border-blue-900/60 dark:bg-blue-950/20'
          : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700'
      }`}
    >
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="text-2xl font-semibold tabular-nums tracking-tight">{value}</dd>
      {hint && (
        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400" title={hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-all ${
        active
          ? 'bg-blue-600 text-white ring-blue-600 shadow-sm shadow-blue-600/25'
          : 'bg-white text-neutral-600 ring-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 dark:bg-neutral-900 dark:text-neutral-400 dark:ring-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
      }`}
    >
      {children}
    </button>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-56 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-blue-500"
      />
    </label>
  );
}

/**
 * Collapsible block.
 *
 * Methodology and caveats matter but should not be the first 500 words a reader
 * meets, so they live behind a summary that says what is inside.
 */
export function Disclosure({
  summary,
  hint,
  children,
  defaultOpen = false,
}: {
  summary: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-neutral-200 open:bg-neutral-50/40 dark:border-neutral-800 dark:open:bg-neutral-900/30"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-medium hover:bg-neutral-50 group-open:border-b group-open:border-neutral-200 dark:hover:bg-neutral-900/50 dark:group-open:border-neutral-800">
        <span className="flex flex-col gap-0.5">
          <span>{summary}</span>
          {hint && (
            <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">
              {hint}
            </span>
          )}
        </span>
        <span
          aria-hidden
          className="shrink-0 text-xs text-neutral-400 transition-transform group-open:rotate-90"
        >
          {'\u25b6'}
        </span>
      </summary>
      <div className="flex flex-col gap-4 px-4 py-4">{children}</div>
    </details>
  );
}

/**
 * Compact inline figures.
 *
 * Replaces a second and third row of stat cards. Four cards per section, four
 * sections deep, stops reading as information and starts reading as wallpaper.
 */
export function FigureStrip({
  items,
}: {
  items: { value: string; label: string; title?: string }[];
}) {
  return (
    <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-3 rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-2" title={item.title}>
          <dd className="text-lg font-semibold tabular-nums">{item.value}</dd>
          <dt className="text-xs text-neutral-500 dark:text-neutral-400">{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}

/** Proportional bar for a 0-100 percentage. */
export function RateBar({ value }: { value: number }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="relative hidden h-1.5 w-16 overflow-hidden rounded-full bg-neutral-200 sm:block dark:bg-neutral-800">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-blue-500 transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </span>
      <span className="w-12 text-right tabular-nums">{value}%</span>
    </span>
  );
}
