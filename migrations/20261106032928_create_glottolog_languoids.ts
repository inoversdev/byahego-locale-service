
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('glottolog_languoids', (table) => {
    table.string('id', 8).primary();

    table.string('family_id', 8).nullable().index();
    table.string('parent_id', 8).nullable().index();

    table.string('name', 255).notNullable();
    table.boolean('bookkeeping').notNullable().defaultTo(false);

    table.string('level', 20).notNullable().index();

    table.decimal('latitude', 10, 7).nullable();
    table.decimal('longitude', 10, 7).nullable();

    table.string('iso639_3', 3).nullable().index();

    table.text('description').nullable();
    table.text('markup_description').nullable();

    table.integer('child_family_count').unsigned().defaultTo(0);
    table.integer('child_language_count').unsigned().defaultTo(0);
    table.integer('child_dialect_count').unsigned().defaultTo(0);

    // Preserve the original country identifiers for now.
    table.text('country_ids').nullable();

    table.bigInteger('language_id').unsigned().nullable().index();

    table.timestamps(true, true);

    table.foreign('language_id')
      .references('languages.id')
      .onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('glottolog_languoids');
}
