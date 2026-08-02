import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { EsciDataSchema, type EsciData, ModelEvalSchema, type ModelEval } from './schema';

/**
 * Loads the precomputed ESCI aggregates.
 *
 * This is the only module that knows the data lives in a file. Everything
 * downstream depends on the schema, so swapping the source later is contained
 * here. The file is committed rather than fetched at runtime because the
 * Hugging Face datasets-server rate-limits anonymous access, and because frozen
 * numbers are citable.
 */

const DATA_PATH = path.join(process.cwd(), 'public', 'data', 'esci.json');

export async function loadEsciData(): Promise<EsciData> {
  let raw: string;
  try {
    raw = await readFile(DATA_PATH, 'utf8');
  } catch {
    throw new Error(
      `No data file at ${DATA_PATH}. Generate it first:\n` +
        `  cd scripts && python3 precompute.py --rows 20000 --locale us --out ../dashboard/public/data`
    );
  }

  const parsed = EsciDataSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `esci.json does not match the expected shape. Re-run the precompute.\n` +
        JSON.stringify(parsed.error.issues.slice(0, 5), null, 2)
    );
  }

  return parsed.data;
}

const MODEL_EVAL_PATH = path.join(process.cwd(), 'public', 'data', 'model_eval.json');

/**
 * Loads the Phase 2 model evaluation, or null if it has not been generated.
 * Optional so the dashboard builds with ground truth alone.
 */
export async function loadModelEval(): Promise<ModelEval | null> {
  let raw: string;
  try {
    raw = await readFile(MODEL_EVAL_PATH, 'utf8');
  } catch {
    return null;
  }

  const parsed = ModelEvalSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `model_eval.json does not match the expected shape. Re-run score_model.py.\n` +
        JSON.stringify(parsed.error.issues.slice(0, 5), null, 2)
    );
  }

  return parsed.data;
}
