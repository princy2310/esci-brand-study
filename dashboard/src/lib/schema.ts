import { z } from 'zod';

/**
 * Contract between the Python precompute step and this dashboard.
 *
 * The precompute samples tasksource/esci and writes aggregates to
 * public/data/esci.json. Parsing through these schemas means a malformed or stale
 * data file fails at load with a useful message, rather than rendering wrong
 * numbers silently.
 */

/** ESCI relevance judgements, ordered most to least relevant. */
export const LABELS = ['Exact', 'Substitute', 'Complement', 'Irrelevant'] as const;
export const LabelSchema = z.enum(LABELS);
export type Label = z.infer<typeof LabelSchema>;

export const MetaSchema = z.object({
  dataset: z.string(),
  license: z.string(),
  citation: z.string(),
  corpusRows: z.number(),
  sampledRows: z.number(),
  samplePct: z.number(),
  generatedAt: z.string(),
  note: z.string(),
});
export type Meta = z.infer<typeof MetaSchema>;

export const TotalsSchema = z.object({
  rowsWithBrand: z.number(),
  distinctBrands: z.number(),
  distinctQueries: z.number(),
  competitiveQueries: z.number(),
  competitivePct: z.number(),
  brandsPerCompetitiveQuery: z.object({
    min: z.number(),
    median: z.number(),
    max: z.number(),
  }),
  labelDistribution: z.record(LabelSchema, z.number()),
  /**
   * Data-quality counters. These are findings about ESCI rather than plumbing:
   * they bound how far the brand column can be trusted, which in turn bounds any
   * correctness claim built on top of it.
   */
  brandsWithVariants: z.number(),
  suspectBrands: z.number(),
  establishedBrands: z.number(),
  nonLatinBrands: z.number(),
  /** Overlap, so suspectBrands and brandsWithVariants are not disjoint. */
  suspectAndVariant: z.number(),
});
export type Totals = z.infer<typeof TotalsSchema>;

/**
 * A brand's aggregate record.
 *
 * `queries` is breadth (how many distinct queries it was judged against) and
 * `exactRate` is precision (what share of its judgements were Exact). High breadth
 * with low exactRate describes a brand that surfaces often but rarely fits.
 */
export const BrandSchema = z.object({
  brand: z.string().min(1),
  judgements: z.number(),
  queries: z.number(),
  exact: z.number(),
  substitute: z.number(),
  complement: z.number(),
  irrelevant: z.number(),
  exactRate: z.number(),
  /** Competitive queries this brand appears in. */
  competitiveQueries: z.number(),
  /**
   * Share of voice as the AEO tools define it: the percentage of competitive
   * queries the brand turns up in, regardless of whether it belonged there.
   * Carried so it can be compared against exactRate, which is agreement.
   */
  shareOfVoice: z.number(),
  /** Spellings collapsed into this record, e.g. 1MORE and 1More. */
  variants: z.number(),
  /** The brand string looks like a product title rather than a brand. */
  suspect: z.boolean(),
  /**
   * Written in a non-Latin script with no parenthesised romanisation, so it
   * cannot be resolved to its Latin-script counterpart without an alias table.
   */
  nonLatin: z.boolean(),
});
export type Brand = z.infer<typeof BrandSchema>;

/** One query with every brand judged against it: a human-labelled competitive set. */
export const CompetitiveSetSchema = z.object({
  query: z.string().min(1),
  brandCount: z.number(),
  products: z.number(),
  /** Brands in this set seen against 3+ queries and not title-like. */
  establishedBrands: z.number(),
  brands: z.array(
    z.object({
      brand: z.string(),
      label: LabelSchema,
      established: z.boolean(),
    })
  ),
});
export type CompetitiveSet = z.infer<typeof CompetitiveSetSchema>;

/** Two brands judged Substitute on the same query: human-labelled alternatives. */
export const SubstitutePairSchema = z.object({
  a: z.string(),
  b: z.string(),
  count: z.number(),
});
export type SubstitutePair = z.infer<typeof SubstitutePairSchema>;

/**
 * Sensitivity data for the share-of-voice against agreement comparison.
 *
 * Agreement rate is not comparable across brands of different breadth, because a
 * brand judged on a single query cannot be wrong. Shipping the sweep rather than
 * one correlation keeps that artifact visible instead of passing it off as a result.
 */
export const VoiceVsAgreementSchema = z.object({
  minJudgements: z.number(),
  minQueries: z.number(),
  floors: z.array(
    z.object({
      minQueries: z.number(),
      brands: z.number(),
      rho: z.number().nullable(),
      perfectAgreement: z.number(),
    })
  ),
  breadthBuckets: z.array(
    z.object({
      queries: z.string(),
      brands: z.number(),
      meanAgreement: z.number(),
      perfectAgreement: z.number(),
      perfectPct: z.number(),
    })
  ),
});
export type VoiceVsAgreementData = z.infer<typeof VoiceVsAgreementSchema>;

/**
 * Phase 2: a model's brand recommendations scored against the ESCI judgements.
 * Optional. The dashboard renders this section only when the file is present.
 */
export const ModelEvalQuerySchema = z.object({
  query: z.string(),
  response: z.string(),
  named: z.array(z.string()),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  precisionInCorpus: z.number().nullable(),
  substituteRate: z.number().nullable(),
  offCorpusRate: z.number().nullable(),
  leaderCaptured: z.boolean().nullable(),
  namedCount: z.number(),
  inCorpusCount: z.number(),
});
export type ModelEvalQuery = z.infer<typeof ModelEvalQuerySchema>;

export const ModelEvalSchema = z.object({
  model: z.string(),
  generatedAt: z.string(),
  queries: z.number(),
  tokensIn: z.number(),
  tokensOut: z.number(),
  estCostUsd: z.number(),
  prompt: z.string(),
  note: z.string(),
  aggregate: z.object({
    recall: z.number().nullable(),
    precision: z.number().nullable(),
    precisionInCorpus: z.number().nullable(),
    substituteRate: z.number().nullable(),
    offCorpusRate: z.number().nullable(),
    leaderCaptureRate: z.number().nullable(),
    meanNamed: z.number().nullable(),
    meanInCorpus: z.number().nullable(),
  }),
  perQuery: z.array(ModelEvalQuerySchema),
});
export type ModelEval = z.infer<typeof ModelEvalSchema>;

export const EsciDataSchema = z.object({
  meta: MetaSchema,
  totals: TotalsSchema,
  voiceVsAgreement: VoiceVsAgreementSchema,
  brands: z.array(BrandSchema),
  competitiveSets: z.array(CompetitiveSetSchema),
  substitutePairs: z.array(SubstitutePairSchema),
});
export type EsciData = z.infer<typeof EsciDataSchema>;
