import type { Knex } from 'knex';

/**
 * Adds a `source` marker so manually managed rows can be told apart from
 * imported ones (imports skip `manual` rows), and a join table that links
 * languoids (dialects) to countries reliably.
 *
 * Note: `country_languages` already has a `source` column (e.g. 'CLDR'),
 * so manual rows there simply use source = 'manual'.
 */
export async function up(knex: Knex): Promise<void> {
  for (const table of ['countries', 'languages', 'glottolog_languoids']) {
    await knex.schema.alterTable(table, (t) => {
      t.string('source', 20).notNullable().defaultTo('import').index();
    });
  }

  await knex.schema.createTable('languoid_countries', (table) => {
    table.string('languoid_id', 8).notNullable();
    table.string('country_code', 2).notNullable().index();
    table.string('source', 20).notNullable().defaultTo('import');

    table.primary(['languoid_id', 'country_code']);

    table
      .foreign('languoid_id')
      .references('glottolog_languoids.id')
      .onDelete('CASCADE');

    table
      .foreign('country_code')
      .references('countries.code')
      .onDelete('CASCADE');
  });

  // Backfill from the whitespace-separated country_ids column.
  const countryRows = await knex('countries').select('code');
  const countryCodes = new Set<string>(
    countryRows.map((row: { code: string }) => row.code)
  );

  const languoids = await knex('glottolog_languoids')
    .select('id', 'country_ids')
    .whereNotNull('country_ids')
    .where('country_ids', '<>', '');

  const links: { languoid_id: string; country_code: string; source: string }[] =
    [];

  for (const row of languoids as { id: string; country_ids: string }[]) {
    const codes = new Set(row.country_ids.split(/\s+/).filter(Boolean));

    for (const code of codes) {
      if (countryCodes.has(code)) {
        links.push({ languoid_id: row.id, country_code: code, source: 'import' });
      }
    }
  }

  for (let i = 0; i < links.length; i += 500) {
    await knex('languoid_countries').insert(links.slice(i, i + 500));
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('languoid_countries');

  for (const table of ['glottolog_languoids', 'languages', 'countries']) {
    await knex.schema.alterTable(table, (t) => {
      t.dropColumn('source');
    });
  }
}
