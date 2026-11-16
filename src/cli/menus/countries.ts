import { Knex } from 'knex';
import {
  BACK,
  askNumber,
  askText,
  attempt,
  confirm,
  menu,
  pickCountry,
  pickFromList,
  pickLanguage,
  printTable,
  select
} from '../ui';

const OFFICIAL_STATUSES = [
  { name: '(none)', value: '' },
  { name: 'official', value: 'official' },
  { name: 'de_facto_official', value: 'de_facto_official' },
  { name: 'official_regional', value: 'official_regional' }
];

// ---------------------------------------------------------------- countries

const addCountry = async (db: Knex): Promise<void> => {
  const code = await askText('Country code (ISO 3166-1 alpha-2)', {
    required: true,
    pattern: /^[A-Z]{2}$/,
    patternHint: 'Use two letters, e.g. PH.',
    transform: (value) => value.toUpperCase(),
    validate: async (value) =>
      (await db('countries').where({ code: value }).first('code'))
        ? `Country ${value} already exists. Use "Edit a country" instead.`
        : true
  });

  const name = await askText('Name', { required: true, maxLength: 150 });
  const nativeName = await askText('Native name', { maxLength: 150 });
  const alpha3 = await askText('Alpha-3 code', {
    pattern: /^[A-Z]{3}$/,
    patternHint: 'Use three letters, e.g. PHL.',
    transform: (value) => value.toUpperCase(),
    validate: async (value) => {
      const clash = await db('countries').where({ alpha3_code: value }).first('code');
      return clash ? `Alpha-3 code ${value} is already used by ${clash.code}.` : true;
    }
  });
  const numeric = await askText('Numeric code', {
    pattern: /^\d{3}$/,
    patternHint: 'Use three digits, e.g. 608.'
  });

  await db('countries').insert({
    code,
    name,
    native_name: nativeName,
    alpha3_code: alpha3,
    numeric_code: numeric,
    source: 'manual'
  });

  console.log(`Added country ${code}.`);
};

const editCountry = async (db: Knex): Promise<void> => {
  const code = await pickCountry(db, 'Which country do you want to edit?');
  const current = await db('countries').where({ code }).first();

  console.log('Saving marks this country as manual, so imports will no longer overwrite it.');

  const name = await askText('Name', {
    required: true,
    default: current.name,
    maxLength: 150
  });
  const nativeName = await askText('Native name', {
    default: current.native_name,
    maxLength: 150
  });
  const alpha3 = await askText('Alpha-3 code', {
    default: current.alpha3_code,
    pattern: /^[A-Z]{3}$/,
    patternHint: 'Use three letters, e.g. PHL.',
    transform: (value) => value.toUpperCase(),
    validate: async (value) => {
      const clash = await db('countries')
        .where({ alpha3_code: value })
        .whereNot({ code })
        .first('code');
      return clash ? `Alpha-3 code ${value} is already used by ${clash.code}.` : true;
    }
  });
  const numeric = await askText('Numeric code', {
    default: current.numeric_code,
    pattern: /^\d{3}$/,
    patternHint: 'Use three digits, e.g. 608.'
  });

  await db('countries').where({ code }).update({
    name,
    native_name: nativeName,
    alpha3_code: alpha3,
    numeric_code: numeric,
    source: 'manual'
  });

  console.log(`Updated country ${code}.`);
};

const countriesMenu = async (db: Knex): Promise<void> => {
  for (;;) {
    const action = await menu({
      message: 'Countries',
      choices: [
        { name: 'Add a country', value: 'add' },
        { name: 'Edit a country', value: 'edit' },
        { name: '← Back', value: 'back' }
      ]
    });

    if (action === 'add') await attempt(() => addCountry(db));
    else if (action === 'edit') await attempt(() => editCountry(db));
    else return;
  }
};

// ---------------------------------------------------------------- languages

const addLanguage = async (db: Knex): Promise<void> => {
  const cldrCode = await askText('Language code (CLDR/BCP 47, e.g. fil)', {
    required: true,
    maxLength: 35,
    pattern: /^[a-zA-Z]{2,8}(-[A-Za-z0-9]{1,8})*$/,
    patternHint: 'Use letters, optionally followed by -subtags.',
    validate: async (value) =>
      (await db('languages').where({ cldr_code: value }).first('id'))
        ? `Language ${value} already exists. Use "Edit a language" instead.`
        : true
  });

  const englishName = await askText('English name', { required: true, maxLength: 150 });
  const nativeName = await askText('Native name', { maxLength: 150 });
  const iso1 = await askText('ISO 639-1 code', {
    pattern: /^[a-z]{2}$/,
    patternHint: 'Use two lowercase letters.',
    transform: (value) => value.toLowerCase()
  });
  const iso3 = await askText('ISO 639-3 code', {
    pattern: /^[a-z]{3}$/,
    patternHint: 'Use three lowercase letters.',
    transform: (value) => value.toLowerCase()
  });

  await db('languages').insert({
    cldr_code: cldrCode,
    english_name: englishName,
    native_name: nativeName,
    iso639_1: iso1,
    iso639_3: iso3,
    source: 'manual'
  });

  console.log(`Added language ${cldrCode}.`);
};

const editLanguage = async (db: Knex): Promise<void> => {
  const id = await pickLanguage(db, 'Which language do you want to edit?');
  const current = await db('languages').where({ id }).first();

  console.log('Saving marks this language as manual, so imports will no longer overwrite it.');

  const englishName = await askText('English name', {
    required: true,
    default: current.english_name,
    maxLength: 150
  });
  const nativeName = await askText('Native name', {
    default: current.native_name,
    maxLength: 150
  });
  const iso1 = await askText('ISO 639-1 code', {
    default: current.iso639_1,
    pattern: /^[a-z]{2}$/,
    patternHint: 'Use two lowercase letters.',
    transform: (value) => value.toLowerCase()
  });
  const iso3 = await askText('ISO 639-3 code', {
    default: current.iso639_3,
    pattern: /^[a-z]{3}$/,
    patternHint: 'Use three lowercase letters.',
    transform: (value) => value.toLowerCase()
  });

  await db('languages').where({ id }).update({
    english_name: englishName,
    native_name: nativeName,
    iso639_1: iso1,
    iso639_3: iso3,
    source: 'manual'
  });

  console.log(`Updated language ${current.cldr_code}.`);
};

const languagesMenu = async (db: Knex): Promise<void> => {
  for (;;) {
    const action = await menu({
      message: 'Languages',
      choices: [
        { name: 'Add a language', value: 'add' },
        { name: 'Edit a language', value: 'edit' },
        { name: '← Back', value: 'back' }
      ]
    });

    if (action === 'add') await attempt(() => addLanguage(db));
    else if (action === 'edit') await attempt(() => editLanguage(db));
    else return;
  }
};

// ------------------------------------------------- country-language mappings

interface MappingRow {
  id: number;
  language: string;
  cldr_code: string;
  official_status: string | null;
  population_percent: string | number | null;
  source: string;
}

const listMappings = (db: Knex, countryCode: string): Promise<MappingRow[]> =>
  db('country_languages as cl')
    .join('languages as l', 'l.id', 'cl.language_id')
    .where('cl.country_code', countryCode)
    .select(
      'cl.id',
      'l.english_name as language',
      'l.cldr_code',
      'cl.official_status',
      'cl.population_percent',
      'cl.source'
    )
    .orderBy('l.english_name');

const pickMapping = async (
  message: string,
  rows: MappingRow[]
): Promise<MappingRow | null> => {
  const choice = await pickFromList(
    message,
    rows.map((row) => ({
      name: `${row.language} [${row.cldr_code}] — ${row.official_status ?? 'no status'}`,
      value: row.id
    }))
  );

  return choice === BACK ? null : rows.find((row) => row.id === choice) ?? null;
};

const addMapping = async (db: Knex, countryCode: string): Promise<void> => {
  const languageId = await pickLanguage(db);
  const status = await select({
    message: 'Official status',
    choices: OFFICIAL_STATUSES
  });
  const percent = await askNumber('Population percent', { min: 0, max: 100, decimals: 3 });

  await db('country_languages')
    .insert({
      country_code: countryCode,
      language_id: languageId,
      official_status: status || null,
      population_percent: percent,
      source: 'manual'
    })
    .onConflict(['country_code', 'language_id'])
    .merge();

  console.log(`Saved language mapping for ${countryCode}.`);
};

const editMapping = async (db: Knex, countryCode: string): Promise<void> => {
  const rows = await listMappings(db, countryCode);

  if (rows.length === 0) {
    console.log(`\nNo languages mapped to ${countryCode} yet.\n`);
    return;
  }

  const picked = await pickMapping('Which mapping do you want to edit?', rows);

  if (!picked) return;

  const status = await select({
    message: 'Official status',
    choices: OFFICIAL_STATUSES,
    default: picked.official_status ?? ''
  });
  const percent = await askNumber('Population percent', {
    min: 0,
    max: 100,
    decimals: 3,
    default: picked.population_percent === null ? null : Number(picked.population_percent)
  });

  await db('country_languages').where({ id: picked.id }).update({
    official_status: status || null,
    population_percent: percent,
    source: 'manual'
  });

  console.log(`Updated mapping for ${picked.language}.`);
};

const removeMapping = async (db: Knex, countryCode: string): Promise<void> => {
  const rows = await listMappings(db, countryCode);

  if (rows.length === 0) {
    console.log(`\nNo languages mapped to ${countryCode} yet.\n`);
    return;
  }

  const picked = await pickMapping('Which mapping do you want to remove?', rows);

  if (!picked) return;

  const warning =
    picked.source === 'manual'
      ? ''
      : ' This mapping came from CLDR and will be re-created by the next CLDR import.';

  const ok = await confirm({
    message: `Remove ${picked.language} from ${countryCode}?${warning}`,
    default: false
  });

  if (!ok) {
    console.log('Cancelled.');
    return;
  }

  await db('country_languages').where({ id: picked.id }).del();
  console.log(`Removed ${picked.language} from ${countryCode}.`);
};

const mappingsMenu = async (db: Knex): Promise<void> => {
  let countryCode = await pickCountry(db);

  for (;;) {
    const action = await menu({
      message: `Country languages — ${countryCode}`,
      choices: [
        { name: 'List languages', value: 'list' },
        { name: 'Add or update a language', value: 'add' },
        { name: 'Edit a mapping', value: 'edit' },
        { name: 'Remove a mapping', value: 'remove' },
        { name: 'Choose another country', value: 'country' },
        { name: '← Back', value: 'back' }
      ]
    });

    switch (action) {
      case 'list':
        printTable(
          (await listMappings(db, countryCode)).map((row) => ({
            language: row.language,
            code: row.cldr_code,
            status: row.official_status,
            population_percent: row.population_percent,
            source: row.source
          })),
          `No languages mapped to ${countryCode}.`
        );
        break;
      case 'add':
        await attempt(() => addMapping(db, countryCode));
        break;
      case 'edit':
        await attempt(() => editMapping(db, countryCode));
        break;
      case 'remove':
        await attempt(() => removeMapping(db, countryCode));
        break;
      case 'country':
        await attempt(async () => {
          countryCode = await pickCountry(db);
        });
        break;
      default:
        return;
    }
  }
};

// ------------------------------------------------------------------- entry

export const countriesAndLanguagesMenu = async (db: Knex): Promise<void> => {
  for (;;) {
    const action = await menu({
      message: 'Countries & languages',
      choices: [
        { name: 'Countries', value: 'countries' },
        { name: 'Languages', value: 'languages' },
        { name: 'Country languages (official status, population)', value: 'mappings' },
        { name: '← Back to main menu', value: 'back' }
      ]
    });

    // Esc on a sub-menu's first prompt (e.g. the country search) returns here.
    if (action === 'countries') await attempt(() => countriesMenu(db), { silent: true });
    else if (action === 'languages') await attempt(() => languagesMenu(db), { silent: true });
    else if (action === 'mappings') await attempt(() => mappingsMenu(db), { silent: true });
    else return;
  }
};
