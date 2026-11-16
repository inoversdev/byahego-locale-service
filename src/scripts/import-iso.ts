
import { Knex } from 'knex';
import {
  ImportOptions,
  ImportResult,
  runInTransaction,
  runLoggedImport,
  runStandalone
} from './utils';

interface Iso639Record {
  iso6393: string;
  iso6392B?: string;
  iso6392T?: string;
  iso6391?: string;
  name: string;
}

const loadIso639Records = (): Iso639Record[] => {
  const imported = require('iso-639-3');

  const records = Array.isArray(imported)
    ? imported
    : Array.isArray(imported.default)
      ? imported.default
      : Array.isArray(imported.iso6393)
        ? imported.iso6393
        : Object.values(imported).find(Array.isArray);

  if (!Array.isArray(records)) {
    throw new Error('Unable to locate ISO 639-3 records in package exports.');
  }

  return records as Iso639Record[];
};

const getIsoVersion = (): string | null => {
  try {
    return require('iso-639-3/package.json').version;
  } catch {
    return null;
  }
};

export const runIsoImport = async (
  db: Knex,
  options: ImportOptions
): Promise<ImportResult> => {
  console.log(`Starting ISO 639 import.${options.dryRun ? ' (dry run)' : ''}`);

  return runLoggedImport(
    db,
    { dataset: 'ISO 639', version: getIsoVersion(), dryRun: options.dryRun },
    async () => {
      const isoRecords = loadIso639Records();

      const byIso6391 = new Map<string, Iso639Record>();
      const byIso6393 = new Map<string, Iso639Record>();
      const byIso6392 = new Map<string, Iso639Record>();

      for (const record of isoRecords) {
        byIso6393.set(record.iso6393, record);

        if (record.iso6391) {
          byIso6391.set(record.iso6391, record);
        }

        if (record.iso6392B) {
          byIso6392.set(record.iso6392B, record);
        }

        if (record.iso6392T) {
          byIso6392.set(record.iso6392T, record);
        }
      }

      // Languages edited through `npm run manage` are left untouched.
      const languages = await db('languages')
        .where('source', '<>', 'manual')
        .select('id', 'cldr_code');

      const counts = await runInTransaction(db, options.dryRun, async (trx) => {
        let updated = 0;
        let unmatched = 0;

        for (const language of languages) {
          const code = language.cldr_code.toLowerCase();

          let record: Iso639Record | undefined;

          if (code.length === 2) {
            record = byIso6391.get(code);
          } else if (code.length === 3) {
            record = byIso6393.get(code) || byIso6392.get(code);
          }

          if (!record) {
            unmatched++;
            continue;
          }

          await trx('languages')
            .where({ id: language.id })
            .update({
              iso639_1: record.iso6391 || null,
              iso639_2: record.iso6392B || record.iso6392T || null,
              iso639_3: record.iso6393
            });

          updated++;
        }

        return { updated, unmatched };
      });

      return {
        recordsImported: counts.updated,
        metadata: {
          isoRecords: isoRecords.length,
          cldrLanguages: languages.length,
          ...counts
        }
      };
    }
  );
};

if (require.main === module) {
  runStandalone('ISO 639', (db) => runIsoImport(db, { dryRun: false }));
}
