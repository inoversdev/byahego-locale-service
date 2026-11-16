import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Countries
  await knex.schema.createTable('countries', (table) => {
    table.string('code', 2).primary();
    table.string('alpha3_code', 3).nullable().unique();
    table.string('numeric_code', 3).nullable();
    table.string('name', 150).notNullable();
    table.string('native_name', 150).nullable();
    table.timestamps(true, true);
  });

  // Languages
  await knex.schema.createTable('languages', (table) => {
    table.bigIncrements('id').primary();
    table.string('cldr_code', 35).notNullable().unique();
    table.string('iso639_1', 2).nullable().index();
    table.string('iso639_3', 3).nullable().index();
    table.string('english_name', 150).notNullable();
    table.string('native_name', 150).nullable();
    table.timestamps(true, true);
  });

  // Languages associated with countries
  await knex.schema.createTable('country_languages', (table) => {
    table.increments('id').primary();

    table.string('country_code', 2).notNullable();
    table.bigInteger('language_id').unsigned().notNullable();

    table.string('official_status', 50).nullable();
    table.decimal('population_percent', 6, 3).nullable();

    table.string('source', 50).notNullable();

    table.foreign('country_code')
      .references('countries.code')
      .onDelete('CASCADE');

    table.foreign('language_id')
      .references('languages.id')
      .onDelete('CASCADE');

    table.unique(['country_code', 'language_id']);
    table.timestamps(true, true);
  });

  // Locales
  await knex.schema.createTable('locales', (table) => {
    table.string('locale_code', 100).primary();

    table.string('language_code', 35).notNullable();
    table.string('script_code', 4).nullable();
    table.string('territory_code', 3).nullable();
    table.string('variant_code', 64).nullable();

    table.string('display_name', 200).nullable();

    table.timestamps(true, true);
  });

  // Dataset import history
  await knex.schema.createTable('dataset_imports', (table) => {
    table.bigIncrements('id').primary();

    table.string('dataset', 50).notNullable();
    table.string('dataset_version', 50).nullable();
    table.string('status', 30).notNullable();

    table.integer('records_imported').unsigned().defaultTo(0);
    table.json('metadata').nullable();

    table.dateTime('started_at').notNullable();
    table.dateTime('completed_at').nullable();

    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('dataset_imports');
  await knex.schema.dropTableIfExists('locales');
  await knex.schema.dropTableIfExists('country_languages');
  await knex.schema.dropTableIfExists('languages');
  await knex.schema.dropTableIfExists('countries');
}