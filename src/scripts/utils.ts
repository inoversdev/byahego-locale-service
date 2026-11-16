import knex, { Knex } from 'knex';
import config from '../../knexfile';

export interface ImportOptions {
  dryRun: boolean;
}

export interface ImportResult {
  dataset: string;
  version: string | null;
  dryRun: boolean;
  recordsImported: number;
  metadata: Record<string, unknown>;
}

export const chunks = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }

  return result;
};

class DryRunRollback<T> extends Error {
  constructor(public readonly result: T) {
    super('Dry run: transaction rolled back.');
  }
}

/**
 * Runs `work` in a transaction. In dry-run mode the transaction is always
 * rolled back, and the work's result is still returned.
 */
export const runInTransaction = async <T>(
  db: Knex,
  dryRun: boolean,
  work: (trx: Knex.Transaction) => Promise<T>
): Promise<T> => {
  try {
    return await db.transaction(async (trx) => {
      const result = await work(trx);

      if (dryRun) {
        throw new DryRunRollback(result);
      }

      return result;
    });
  } catch (error) {
    if (error instanceof DryRunRollback) {
      return error.result as T;
    }

    throw error;
  }
};

export interface LoggedImportSpec {
  dataset: string;
  version: string | null;
  dryRun: boolean;
}

/**
 * Wraps an import with `dataset_imports` bookkeeping. Dry runs write no
 * history row. Errors are recorded as `failed` and re-thrown.
 */
export const runLoggedImport = async (
  db: Knex,
  spec: LoggedImportSpec,
  work: () => Promise<{
    recordsImported: number;
    metadata: Record<string, unknown>;
  }>
): Promise<ImportResult> => {
  let importId: number | undefined;

  if (!spec.dryRun) {
    const [insertedId] = await db('dataset_imports').insert({
      dataset: spec.dataset,
      dataset_version: spec.version,
      status: 'running',
      started_at: db.fn.now()
    });

    importId = insertedId;
  }

  try {
    const { recordsImported, metadata } = await work();

    if (importId !== undefined) {
      await db('dataset_imports')
        .where({ id: importId })
        .update({
          status: 'completed',
          records_imported: recordsImported,
          metadata: JSON.stringify(metadata),
          completed_at: db.fn.now()
        });
    }

    return {
      dataset: spec.dataset,
      version: spec.version,
      dryRun: spec.dryRun,
      recordsImported,
      metadata
    };
  } catch (error) {
    if (importId !== undefined) {
      await db('dataset_imports')
        .where({ id: importId })
        .update({
          status: 'failed',
          completed_at: db.fn.now(),
          metadata: JSON.stringify({
            error: error instanceof Error ? error.message : String(error)
          })
        });
    }

    throw error;
  }
};

/**
 * Entry point helper for the standalone `npm run *:import` scripts.
 */
export const runStandalone = async (
  label: string,
  execute: (db: Knex) => Promise<ImportResult>
): Promise<void> => {
  const db = knex(config.development);

  try {
    const result = await execute(db);

    console.log(`${label} import completed.`);
    console.log(result.metadata);
  } catch (error) {
    console.error(`${label} import failed:`, error);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
};
