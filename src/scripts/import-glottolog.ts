
import { Knex } from 'knex';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import {
  ImportOptions,
  ImportResult,
  chunks,
  runInTransaction,
  runLoggedImport,
  runStandalone
} from './utils';

const GLOTTOLOG_VERSION = '5.3';

interface GlottologRecord {
  id: string;
  family_id: string;
  parent_id: string;
  name: string;
  bookkeeping: string;
  level: string;
  latitude: string;
  longitude: string;
  iso639P3code: string;
  description: string;
  markup_description: string;
  child_family_count: string;
  child_language_count: string;
  child_dialect_count: string;
  country_ids: string;
}

const toNumber = (value: string): number | null => {
  if (!value) return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toInteger = (value: string): number => {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : 0;
};

export const runGlottologImport = async (
  db: Knex,
  options: ImportOptions
): Promise<ImportResult> => {
  console.log(
    `Starting Glottolog import.${options.dryRun ? ' (dry run)' : ''}`
  );

  return runLoggedImport(
    db,
    {
      dataset: 'Glottolog',
      version: GLOTTOLOG_VERSION,
      dryRun: options.dryRun
    },
    async () => {
      const csvPath = path.resolve(
        process.cwd(),
        'datasets/glottolog/languoid.csv'
      );

      if (!fs.existsSync(csvPath)) {
        throw new Error(`Glottolog CSV not found: ${csvPath}`);
      }

      console.log('Reading Glottolog CSV...');

      const records = parse(fs.readFileSync(csvPath, 'utf8'), {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        trim: true
      }) as GlottologRecord[];

      console.log(`Found ${records.length} Glottolog records.`);

      // Build an ISO 639-3 -> existing language ID lookup.
      const languages = await db('languages').select('id', 'iso639_3');

      const languageIds = new Map<string, number>();

      for (const language of languages) {
        if (language.iso639_3) {
          languageIds.set(language.iso639_3.toLowerCase(), language.id);
        }
      }

      // Rows created through `npm run manage` use non-Glottolog IDs
      // (`x_######`), so they never collide with the CSV.
      const mappedRecords = records.map((record) => {
        const isoCode = record.iso639P3code?.trim().toLowerCase() || null;

        // Only standardized language-level records are linked.
        const languageId =
          record.level === 'language' && isoCode
            ? languageIds.get(isoCode) || null
            : null;

        return {
          id: record.id,
          family_id: record.family_id || null,
          parent_id: record.parent_id || null,
          name: record.name,
          bookkeeping: record.bookkeeping === 'True',
          level: record.level,
          latitude: toNumber(record.latitude),
          longitude: toNumber(record.longitude),
          iso639_3: isoCode,
          description: record.description || null,
          markup_description: record.markup_description || null,
          child_family_count: toInteger(record.child_family_count),
          child_language_count: toInteger(record.child_language_count),
          child_dialect_count: toInteger(record.child_dialect_count),
          country_ids: record.country_ids || null,
          language_id: languageId
        };
      });

      const linkedCountries = await runInTransaction(
        db,
        options.dryRun,
        async (trx) => {
          for (const batch of chunks(mappedRecords, 500)) {
            await trx('glottolog_languoids')
              .insert(batch)
              .onConflict('id')
              .merge();
          }

          // Rebuild imported dialect/country links. Manual links are kept.
          const countryRows = await trx('countries').select('code');
          const countryCodes = new Set<string>(
            countryRows.map((row: { code: string }) => row.code)
          );

          const links: {
            languoid_id: string;
            country_code: string;
            source: string;
          }[] = [];

          for (const record of mappedRecords) {
            if (!record.country_ids) continue;

            const codes = new Set(record.country_ids.split(/\s+/));

            for (const code of codes) {
              if (countryCodes.has(code)) {
                links.push({
                  languoid_id: record.id,
                  country_code: code,
                  source: 'import'
                });
              }
            }
          }

          await trx('languoid_countries').where({ source: 'import' }).del();

          for (const batch of chunks(links, 500)) {
            await trx('languoid_countries')
              .insert(batch)
              .onConflict(['languoid_id', 'country_code'])
              .ignore();
          }

          return links.length;
        }
      );

      const linkedLanguages = mappedRecords.filter(
        (record) => record.language_id !== null
      ).length;

      const levels = mappedRecords.reduce(
        (counts, record) => {
          counts[record.level] = (counts[record.level] || 0) + 1;
          return counts;
        },
        {} as Record<string, number>
      );

      return {
        recordsImported: mappedRecords.length,
        metadata: {
          total: mappedRecords.length,
          linkedLanguages,
          linkedCountries,
          levels
        }
      };
    }
  );
};

if (require.main === module) {
  runStandalone('Glottolog', (db) =>
    runGlottologImport(db, { dryRun: false })
  );
}
