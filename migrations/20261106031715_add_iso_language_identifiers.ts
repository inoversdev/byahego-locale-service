import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('languages', (table) => {
    table.string('iso639_2', 3).nullable().index();
    table.string('glottolog_id', 20).nullable().index();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('languages', (table) => {
    table.dropColumn('iso639_2');
    table.dropColumn('glottolog_id');
  });
}