import type { Brand, CompetitiveSet, Label, SubstitutePair } from './schema';

/**
 * Derivations over the precomputed aggregates.
 *
 * Kept as pure functions so they are testable without mounting components, and so
 * filters recompute rather than merely hiding rows.
 */

export const LABEL_ORDER: Label[] = ['Exact', 'Substitute', 'Complement', 'Irrelevant'];

export const LABEL_MEANING: Record<Label, string> = {
  Exact: 'Product matches the query intent',
  Substitute: 'Not exact, but a reasonable alternative',
  Complement: 'Used with the product, not instead of it',
  Irrelevant: 'Does not match the intent',
};

function round(value: number, places = 1): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/* ------------------------------------------------------------------ *
 * Brands
 * ------------------------------------------------------------------ */

export type BrandSort = 'judgements' | 'queries' | 'exactRate' | 'brand';

/**
 * Two ways to look at the brand list.
 *
 * These are presented as one choice rather than separate threshold and flag
 * controls, because the gap between them is a finding: most brand strings in ESCI
 * are one-off sellers or product titles, and which set you analyse changes every
 * number downstream.
 */
export type BrandUniverse = 'recognisable' | 'all';

export const UNIVERSE_RULES: Record<BrandUniverse, { minJudgements: number; excludeSuspect: boolean }> =
  {
    recognisable: { minJudgements: 5, excludeSuspect: true },
    all: { minJudgements: 1, excludeSuspect: false },
  };

export interface BrandFilters {
  /** Minimum judgements, to exclude the long tail of marketplace sellers. */
  minJudgements: number;
  search: string;
  /** Drop brand strings that look like product titles. */
  excludeSuspect: boolean;
}

export function filterBrands(brands: Brand[], filters: BrandFilters): Brand[] {
  const needle = filters.search.trim().toLowerCase();
  return brands.filter((b) => {
    if (filters.excludeSuspect && b.suspect) return false;
    if (b.judgements < filters.minJudgements) return false;
    if (needle && !b.brand.toLowerCase().includes(needle)) return false;
    return true;
  });
}

export function sortBrands(brands: Brand[], sort: BrandSort): Brand[] {
  const copy = [...brands];
  if (sort === 'brand') return copy.sort((a, b) => a.brand.localeCompare(b.brand));
  return copy.sort((a, b) => b[sort] - a[sort] || b.judgements - a.judgements);
}

/**
 * Breadth versus fit.
 *
 * Brands appearing across many queries but rarely judged Exact are surfacing
 * broadly without matching intent. That distinction is invisible in a raw
 * share-of-voice count, which is the point of showing it.
 */
export interface BreadthFitPoint {
  brand: string;
  queries: number;
  exactRate: number;
  judgements: number;
}

export function breadthVsFit(brands: Brand[], minJudgements = 5): BreadthFitPoint[] {
  return brands
    .filter((b) => b.judgements >= minJudgements)
    .map((b) => ({
      brand: b.brand,
      queries: b.queries,
      exactRate: b.exactRate,
      judgements: b.judgements,
    }));
}

/* ------------------------------------------------------------------ *
 * Share of voice against agreement
 * ------------------------------------------------------------------ */

/**
 * The comparison the study exists to make.
 *
 * Share of voice ranks brands by how much of the query set they turn up in, which
 * is what the commercial AEO tools report. Agreement ranks them by how often human
 * raters judged them a genuine match. Where the two rankings disagree, a
 * presence-based report and a correctness-based one would tell a brand different
 * things about the same data.
 */
export interface DivergenceRow {
  brand: string;
  shareOfVoice: number;
  exactRate: number;
  voiceRank: number;
  agreementRank: number;
  /** Positive means it ranks better on presence than on correctness. */
  gap: number;
  judgements: number;
}

/**
 * A breadth floor is required, not optional.
 *
 * Filtering on judgement count alone lets in brands judged on a single query,
 * which reach 100% agreement mechanically. With no query floor the rank
 * correlation reads -0.09; at five queries it reads +0.09. The floor is the
 * difference between a finding and an artifact.
 */
export function rankDivergence(
  brands: Brand[],
  minJudgements = 10,
  minQueries = 5
): DivergenceRow[] {
  const pool = brands.filter(
    (b) =>
      b.judgements >= minJudgements && b.queries >= minQueries && !b.suspect && !b.nonLatin
  );

  const byVoice = [...pool].sort(
    (a, b) => b.shareOfVoice - a.shareOfVoice || a.brand.localeCompare(b.brand)
  );
  const byAgreement = [...pool].sort(
    (a, b) => b.exactRate - a.exactRate || a.brand.localeCompare(b.brand)
  );

  const voiceRank = new Map(byVoice.map((b, i) => [b.brand, i + 1]));
  const agreementRank = new Map(byAgreement.map((b, i) => [b.brand, i + 1]));

  return pool
    .map((b) => {
      const vr = voiceRank.get(b.brand) ?? 0;
      const ar = agreementRank.get(b.brand) ?? 0;
      return {
        brand: b.brand,
        shareOfVoice: b.shareOfVoice,
        exactRate: b.exactRate,
        voiceRank: vr,
        agreementRank: ar,
        gap: ar - vr,
        judgements: b.judgements,
      };
    })
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}

/** Spearman rank correlation between the two orderings, as a single summary. */
export function rankCorrelation(rows: DivergenceRow[]): number {
  const n = rows.length;
  if (n < 2) return 0;
  const sumSquared = rows.reduce((s, r) => s + (r.voiceRank - r.agreementRank) ** 2, 0);
  return round(1 - (6 * sumSquared) / (n * (n * n - 1)), 2);
}

/* ------------------------------------------------------------------ *
 * Competitive sets
 * ------------------------------------------------------------------ */

export interface SetFilters {
  search: string;
  /**
   * Require at least this many recognisable brands. Filtering on raw brand count
   * surfaces queries crowded with single-appearance sellers, which are the least
   * useful sets in the dataset, so that control was removed in favour of this one.
   */
  minEstablished: number;
}

export function filterSets(sets: CompetitiveSet[], filters: SetFilters): CompetitiveSet[] {
  const needle = filters.search.trim().toLowerCase();
  return sets.filter((s) => {
    if (s.establishedBrands < filters.minEstablished) return false;
    if (needle) {
      const inQuery = s.query.toLowerCase().includes(needle);
      const inBrands = s.brands.some((b) => b.brand.toLowerCase().includes(needle));
      if (!inQuery && !inBrands) return false;
    }
    return true;
  });
}

/** Label mix within a set of queries, recomputed under whatever filter is active. */
export function labelMix(sets: CompetitiveSet[]): { label: Label; count: number; pct: number }[] {
  const counts = new Map<Label, number>(LABEL_ORDER.map((l) => [l, 0]));
  let total = 0;
  for (const s of sets) {
    for (const b of s.brands) {
      counts.set(b.label, (counts.get(b.label) ?? 0) + 1);
      total += 1;
    }
  }
  return LABEL_ORDER.map((label) => {
    const count = counts.get(label) ?? 0;
    return { label, count, pct: total ? round((count / total) * 100) : 0 };
  });
}

/**
 * Distribution of competitive-set sizes.
 *
 * A study needs sets with enough brands to be meaningful, so this shows how many
 * queries clear a given threshold.
 */
export function setSizeHistogram(sets: CompetitiveSet[]): { size: string; count: number }[] {
  const buckets: Record<string, number> = { '2': 0, '3': 0, '4': 0, '5': 0, '6-9': 0, '10+': 0 };
  for (const s of sets) {
    const n = s.brandCount;
    if (n >= 10) buckets['10+'] += 1;
    else if (n >= 6) buckets['6-9'] += 1;
    else buckets[String(n)] = (buckets[String(n)] ?? 0) + 1;
  }
  return Object.entries(buckets).map(([size, count]) => ({ size, count }));
}

/* ------------------------------------------------------------------ *
 * Substitute graph
 * ------------------------------------------------------------------ */

/**
 * Brands most often judged Substitute alongside others.
 *
 * This is a competitor map derived from human judgement rather than inferred from
 * co-mention, which is how commercial tools usually approximate it.
 */
export interface RivalrySummary {
  brand: string;
  rivals: { brand: string; count: number }[];
  totalPairings: number;
}

export function topRivalries(pairs: SubstitutePair[], limit = 20): RivalrySummary[] {
  const byBrand = new Map<string, Map<string, number>>();

  const add = (from: string, to: string, n: number) => {
    const inner = byBrand.get(from) ?? new Map<string, number>();
    inner.set(to, (inner.get(to) ?? 0) + n);
    byBrand.set(from, inner);
  };

  for (const p of pairs) {
    add(p.a, p.b, p.count);
    add(p.b, p.a, p.count);
  }

  return [...byBrand.entries()]
    .map(([brand, inner]) => {
      const rivals = [...inner.entries()]
        .map(([b, count]) => ({ brand: b, count }))
        .sort((x, y) => y.count - x.count);
      return {
        brand,
        rivals: rivals.slice(0, 6),
        totalPairings: rivals.reduce((s, r) => s + r.count, 0),
      };
    })
    .sort((a, b) => b.totalPairings - a.totalPairings)
    .slice(0, limit);
}
