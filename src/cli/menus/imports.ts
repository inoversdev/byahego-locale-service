import { Knex } from 'knex';
import { confirm, select } from '@inquirer/prompts';
import { runCldrImport } from '../../scripts/import-cldr';
import { runIsoImport } from '../../scripts/import-iso';
import { runGlottologImport } from '../../scripts/import-glottolog';
import { ImportOptions, ImportResult } from '../../scripts/utils';
import { printTable } from '../ui';

type Runner = (db: Knex, options: ImportOptions) => Promise<ImportResult>;

const RUNNERS: Record<string, { label: string; run: Runner }> = {
  cldr: { label: 'CLDR (countries, languages, country languages)', run: runCldrImport },
  iso: { label: 'ISO 639 (language codes)', run: runIsoImport },
  glottolog: { label: 'Glottolog (languoids and dialects)', run: runGlottologImport }
};

// Order matters: ISO and Glottolog both depend on CLDR's languages/countries.
const ALL_ORDER = ['cldr', 'iso', 'glottolog'];

/**
 * Ctrl+C during an import: the open transaction is dropped with the
 * connection (rolled back), and any `running` history row is marked failed.
 */
const installCancelHandler = (db: Knex): (() => void) => {
  const handler = (): void => {
    console.log('\nCancelling import...');

    db('dataset_imports')
      .where({ status: 'running' })
      .update({
        status: 'failed',
        completed_at: db.fn.now(),
        metadata: JSON.stringify({ cancelled: true })
      })
      .catch(() => undefined)
      .finally(() => {
        void db.destroy().finally(() => process.exit(130));
      });
  };

  process.once('SIGINT', handler);

  return () => {
    process.removeListener('SIGINT', handler);
  };
};

export const importsMenu = async (db: Knex): Promise<void> => {
  const dataset = await select({
    message: 'Run an import',
    choices: [
      ...Object.entries(RUNNERS).map(([value, { label }]) => ({
        name: label,
        value
      })),
      { name: 'All datasets, in order (CLDR → ISO → Glottolog)', value: 'all' },
      { name: '← Back to main menu', value: 'back' }
    ]
  });

  if (dataset === 'back') return;

  const dryRun = await confirm({
    message: 'Dry run? (runs everything, then rolls back; nothing is saved)',
    default: true
  });

  const keys = dataset === 'all' ? ALL_ORDER : [dataset];

  const ok = await confirm({
    message: `${dryRun ? 'Dry-run' : 'Run'} ${keys.map((key) => RUNNERS[key].label.split(' ')[0]).join(', ')}?`,
    default: true
  });

  if (!ok) {
    console.log('Cancelled.');
    return;
  }

  const removeHandler = installCancelHandler(db);
  const results: Record<string, unknown>[] = [];

  try {
    for (const key of keys) {
      const result = await RUNNERS[key].run(db, { dryRun });

      results.push({
        dataset: result.dataset,
        version: result.version,
        mode: result.dryRun ? 'dry run' : 'saved',
        records: result.recordsImported
      });

      console.log(result.metadata);
    }
  } catch (error) {
    console.error('Import failed:', error instanceof Error ? error.message : error);
    console.log('Stopped. Earlier datasets in this run may already be saved.');
  } finally {
    removeHandler();
  }

  printTable(results);
};
