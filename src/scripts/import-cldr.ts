
import { Knex } from 'knex';
import {
  ImportOptions,
  ImportResult,
  chunks,
  runInTransaction,
  runLoggedImport,
  runStandalone
} from './utils';

interface CldrLanguagePopulation {
  _populationPercent?: string;
  _officialStatus?: string;
}

interface CldrTerritoryInfo {
  languagePopulation?: Record<string, CldrLanguagePopulation>;
}

const territoryInfoData = require('cldr-core/supplemental/territoryInfo.json');
const languageData = require('cldr-localenames-full/main/en/languages.json');
const territoryData = require('cldr-localenames-full/main/en/territories.json');

const territoryInfo: Record<string, CldrTerritoryInfo> =
  territoryInfoData.supplemental.territoryInfo;

const languageNames: Record<string, string> =
  languageData.main.en.localeDisplayNames.languages;

const territoryNames: Record<string, string> =
  territoryData.main.en.localeDisplayNames.territories;

const isRegionCode = (code: string): boolean => /^[A-Z]{2}$/.test(code);

const isLanguageCode = (code: string): boolean =>
  /^[a-z]{2,3}$/.test(code);

const getCldrVersion = (): string => {
  try {
    return require('cldr-core/package.json').version;
  } catch {
    return 'unknown';
  }
};

const insertInChunks = async (
  trx: Knex.Transaction,
  table: string,
  records: Record<string, unknown>[]
): Promise<void> => {
  for (const batch of chunks(records, 500)) {
    await trx(table)
      .insert(batch)
      .onConflict()
      .merge();
  }
};

const importCountries = async (trx: Knex.Transaction): Promise<number> => {
  // Rows edited through `npm run manage` are never overwritten by imports.
  const locked = new Set<string>(
    (await trx('countries').where({ source: 'manual' }).select('code')).map(
      (row: { code: string }) => row.code
    )
  );

  const records = Object.entries(territoryNames)
    .filter(([code]) => isRegionCode(code) && !locked.has(code))
    .map(([code, name]) => ({
      code,
      name
    }));

  await insertInChunks(trx, 'countries', records);

  return records.length;
};

const importLanguages = async (trx: Knex.Transaction): Promise<number> => {
  const languageCodes = new Set<string>();

  Object.keys(languageNames).forEach((code) => {
    if (isLanguageCode(code)) {
      languageCodes.add(code);
    }
  });

  // Include language identifiers found in country-language metadata,
  // even if they do not have an English display name in this CLDR file.
  Object.values(territoryInfo).forEach((territory) => {
    Object.keys(territory.languagePopulation || {}).forEach((code) => {
      if (isLanguageCode(code)) {
        languageCodes.add(code);
      }
    });
  });

  const locked = new Set<string>(
    (
      await trx('languages').where({ source: 'manual' }).select('cldr_code')
    ).map((row: { cldr_code: string }) => row.cldr_code)
  );

  const records = Array.from(languageCodes)
    .filter((code) => !locked.has(code))
    .map((code) => ({
    cldr_code: code,
    iso639_1: code.length === 2 ? code : null,
    iso639_3: null,
    english_name: languageNames[code] || code
  }));

  await insertInChunks(trx, 'languages', records);

  return records.length;
};

const importCountryLanguages = async (
  trx: Knex.Transaction
): Promise<number> => {
  const countryRows = await trx('countries').select('code');
  const languageRows = await trx('languages').select('id', 'cldr_code');

  const countryCodes = new Set<string>(
    countryRows.map((row: { code: string }) => row.code)
  );

  const languageIds = new Map<string, number>(
    languageRows.map((row: { id: number; cldr_code: string }) => [
      row.cldr_code,
      row.id
    ])
  );

  const lockedMappings = new Set<string>(
    (
      await trx('country_languages')
        .where({ source: 'manual' })
        .select('country_code', 'language_id')
    ).map(
      (row: { country_code: string; language_id: number }) =>
        `${row.country_code}:${row.language_id}`
    )
  );

  const records: Record<string, unknown>[] = [];

  for (const [countryCode, territory] of Object.entries(territoryInfo)) {
    if (!countryCodes.has(countryCode)) {
      continue;
    }

    for (const [languageCode, details] of Object.entries(
      territory.languagePopulation || {}
    )) {
      const languageId = languageIds.get(languageCode);

      if (!languageId || lockedMappings.has(`${countryCode}:${languageId}`)) {
        continue;
      }

      const populationPercent = details._populationPercent
        ? Number(details._populationPercent)
        : null;

      records.push({
        country_code: countryCode,
        language_id: languageId,
        official_status: details._officialStatus || null,
        population_percent:
          populationPercent !== null && Number.isFinite(populationPercent)
            ? populationPercent
            : null,
        source: 'CLDR'
      });
    }
  }

  await insertInChunks(trx, 'country_languages', records);

  return records.length;
};

export const runCldrImport = async (
  db: Knex,
  options: ImportOptions
): Promise<ImportResult> => {
  const version = getCldrVersion();

  console.log(
    `Starting CLDR import. Version: ${version}${options.dryRun ? ' (dry run)' : ''}`
  );

  return runLoggedImport(
    db,
    { dataset: 'CLDR', version, dryRun: options.dryRun },
    async () => {
      const result = await runInTransaction(db, options.dryRun, async (trx) => {
        const countries = await importCountries(trx);
        const languages = await importLanguages(trx);
        const countryLanguages = await importCountryLanguages(trx);

        return { countries, languages, countryLanguages };
      });

      return {
        recordsImported:
          result.countries + result.languages + result.countryLanguages,
        metadata: result
      };
    }
  );
};

if (require.main === module) {
  runStandalone('CLDR', (db) => runCldrImport(db, { dryRun: false }));
}
