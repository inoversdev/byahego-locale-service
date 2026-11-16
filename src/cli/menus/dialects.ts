import { Knex } from 'knex';
import {
  BACK,
  askCoordinates,
  askText,
  attempt,
  confirm,
  menu,
  pickCountry,
  pickFromList,
  printTable,
  search
} from '../ui';

interface DialectRow {
  id: string;
  name: string;
  parent: string | null;
  iso639_3: string | null;
  source: string;
  link_source: string;
}

const MANUAL_ID_PREFIX = 'x_';

const listDialects = (db: Knex, countryCode: string): Promise<DialectRow[]> =>
  db('glottolog_languoids as gl')
    .join('languoid_countries as lc', 'lc.languoid_id', 'gl.id')
    .leftJoin('glottolog_languoids as parent', 'parent.id', 'gl.parent_id')
    .where('gl.level', 'dialect')
    .andWhere('lc.country_code', countryCode)
    .select(
      'gl.id',
      'gl.name',
      'parent.name as parent',
      'gl.iso639_3',
      'gl.source',
      'lc.source as link_source'
    )
    .orderBy('gl.name');

/** Next free manual ID: x_000001, x_000002, ... (fits string(8)). */
const nextManualId = async (db: Knex): Promise<string> => {
  const last = await db('glottolog_languoids')
    .where('id', 'like', 'x\\_%')
    .orderBy('id', 'desc')
    .first('id');

  const lastNumber = last ? Number.parseInt(last.id.slice(2), 10) : 0;
  const next = (Number.isFinite(lastNumber) ? lastNumber : 0) + 1;

  if (next > 999999) {
    throw new Error('Manual dialect ID space exhausted.');
  }

  return `${MANUAL_ID_PREFIX}${String(next).padStart(6, '0')}`;
};

const NO_PARENT = '__none__';

const pickParentLanguage = async (
  db: Knex
): Promise<{ id: string; family_id: string | null } | null> => {
  const picked = await search<string>({
    message: 'Parent language (search by name, or choose "none")',
    source: async (term) => {
      const query = db('glottolog_languoids')
        .where('level', 'language')
        .select('id', 'name', 'iso639_3')
        .orderBy('name')
        .limit(20);

      if (term?.trim()) {
        query.where('name', 'like', `%${term.trim()}%`);
      }

      const rows = await query;

      return [
        { name: '(none)', value: NO_PARENT },
        ...rows.map((row: { id: string; name: string; iso639_3: string | null }) => ({
          name: `${row.name} [${row.id}${row.iso639_3 ? `/${row.iso639_3}` : ''}]`,
          value: row.id
        }))
      ];
    }
  });

  if (picked === NO_PARENT) {
    return null;
  }

  const parent = await db('glottolog_languoids')
    .where({ id: picked })
    .first('id', 'family_id');

  return parent ? { id: parent.id, family_id: parent.family_id ?? parent.id } : null;
};

const addDialect = async (db: Knex, countryCode: string): Promise<void> => {
  const name = await askText('Dialect name', { required: true, maxLength: 255 });
  const parent = await pickParentLanguage(db);
  const iso = await askText('ISO 639-3 code', {
    pattern: /^[a-z]{3}$/,
    patternHint: 'Use three lowercase letters.',
    transform: (value) => value.toLowerCase()
  });
  const { latitude, longitude } = await askCoordinates();
  const description = await askText('Description');

  const ok = await confirm({
    message: `Add dialect "${name}" to ${countryCode}?`,
    default: true
  });

  if (!ok) {
    console.log('Cancelled.');
    return;
  }

  const id = await nextManualId(db);

  await db.transaction(async (trx) => {
    await trx('glottolog_languoids').insert({
      id,
      family_id: parent?.family_id ?? null,
      parent_id: parent?.id ?? null,
      name,
      bookkeeping: false,
      level: 'dialect',
      latitude,
      longitude,
      iso639_3: iso,
      description,
      country_ids: countryCode,
      source: 'manual'
    });

    await trx('languoid_countries').insert({
      languoid_id: id,
      country_code: countryCode,
      source: 'manual'
    });
  });

  console.log(`Added dialect ${id} (${name}) to ${countryCode}.`);
};

const pickDialect = async (
  message: string,
  rows: DialectRow[]
): Promise<DialectRow | null> => {
  const choice = await pickFromList(
    message,
    rows.map((row) => ({
      name: `${row.name} [${row.id}]`,
      value: row.id
    }))
  );

  return choice === BACK ? null : rows.find((row) => row.id === choice) ?? null;
};

const editDialect = async (db: Knex, countryCode: string): Promise<void> => {
  const manual = (await listDialects(db, countryCode)).filter(
    (row) => row.source === 'manual'
  );

  if (manual.length === 0) {
    console.log('\nNo manual dialects to edit. Imported dialects are read-only.\n');
    return;
  }

  const picked = await pickDialect('Which dialect do you want to edit?', manual);

  if (!picked) return;

  const current = await db('glottolog_languoids').where({ id: picked.id }).first();

  const name = await askText('Dialect name', {
    required: true,
    default: current.name,
    maxLength: 255
  });
  const iso = await askText('ISO 639-3 code', {
    default: current.iso639_3,
    pattern: /^[a-z]{3}$/,
    patternHint: 'Use three lowercase letters.',
    transform: (value) => value.toLowerCase()
  });
  const { latitude, longitude } = await askCoordinates({
    latitude: current.latitude === null ? null : Number(current.latitude),
    longitude: current.longitude === null ? null : Number(current.longitude)
  });
  const description = await askText('Description', { default: current.description });

  await db('glottolog_languoids')
    .where({ id: picked.id })
    .update({ name, iso639_3: iso, latitude, longitude, description });

  console.log(`Updated dialect ${picked.id}.`);
};

const removeDialect = async (db: Knex, countryCode: string): Promise<void> => {
  const manual = (await listDialects(db, countryCode)).filter(
    (row) => row.source === 'manual'
  );

  if (manual.length === 0) {
    console.log('\nNo manual dialects to remove. Imported dialects are read-only.\n');
    return;
  }

  const picked = await pickDialect('Which dialect do you want to remove?', manual);

  if (!picked) return;

  const ok = await confirm({
    message: `Delete "${picked.name}" (${picked.id}) and all its country links?`,
    default: false
  });

  if (!ok) {
    console.log('Cancelled.');
    return;
  }

  await db('glottolog_languoids').where({ id: picked.id }).del();
  console.log(`Removed dialect ${picked.id}.`);
};

const attachDialect = async (db: Knex, countryCode: string): Promise<void> => {
  const id = await search<string>({
    message: 'Search an existing dialect by name',
    source: async (term) => {
      if (!term?.trim()) {
        return [];
      }

      const rows = await db('glottolog_languoids as gl')
        .leftJoin('glottolog_languoids as parent', 'parent.id', 'gl.parent_id')
        .where('gl.level', 'dialect')
        .andWhere('gl.name', 'like', `%${term.trim()}%`)
        .select('gl.id', 'gl.name', 'parent.name as parent')
        .orderBy('gl.name')
        .limit(20);

      return rows.map((row: { id: string; name: string; parent: string | null }) => ({
        name: `${row.name}${row.parent ? ` (${row.parent})` : ''} [${row.id}]`,
        value: row.id
      }));
    }
  });

  await db('languoid_countries')
    .insert({ languoid_id: id, country_code: countryCode, source: 'manual' })
    .onConflict(['languoid_id', 'country_code'])
    .ignore();

  console.log(`Linked dialect ${id} to ${countryCode}.`);
};

const detachDialect = async (db: Knex, countryCode: string): Promise<void> => {
  const linked = (await listDialects(db, countryCode)).filter(
    (row) => row.link_source === 'manual'
  );

  if (linked.length === 0) {
    console.log(
      '\nNo manually linked dialects here. Imported links are rebuilt by each Glottolog import.\n'
    );
    return;
  }

  const picked = await pickDialect('Which link do you want to remove?', linked);

  if (!picked) return;

  await db('languoid_countries')
    .where({ languoid_id: picked.id, country_code: countryCode })
    .del();

  console.log(`Unlinked ${picked.id} from ${countryCode}.`);
};

export const dialectsMenu = async (db: Knex): Promise<void> => {
  let countryCode = await pickCountry(db);

  for (;;) {
    const country = await db('countries').where({ code: countryCode }).first('name');

    const action = await menu({
      message: `Dialects — ${countryCode} ${country?.name ?? ''}`,
      choices: [
        { name: 'List dialects', value: 'list' },
        { name: 'Add a new dialect', value: 'add' },
        { name: 'Edit a manual dialect', value: 'edit' },
        { name: 'Remove a manual dialect', value: 'remove' },
        { name: 'Link an existing dialect to this country', value: 'attach' },
        { name: 'Remove a manual link', value: 'detach' },
        { name: 'Choose another country', value: 'country' },
        { name: '← Back to main menu', value: 'back' }
      ]
    });

    switch (action) {
      case 'list':
        printTable(
          (await listDialects(db, countryCode)).map((row) => ({
            id: row.id,
            name: row.name,
            parent: row.parent,
            iso639_3: row.iso639_3,
            source: row.source,
            link: row.link_source
          })),
          `No dialects recorded for ${countryCode}.`
        );
        break;
      case 'add':
        await attempt(() => addDialect(db, countryCode));
        break;
      case 'edit':
        await attempt(() => editDialect(db, countryCode));
        break;
      case 'remove':
        await attempt(() => removeDialect(db, countryCode));
        break;
      case 'attach':
        await attempt(() => attachDialect(db, countryCode));
        break;
      case 'detach':
        await attempt(() => detachDialect(db, countryCode));
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
