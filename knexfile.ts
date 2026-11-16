// Re-exports the config in src so the knex CLI (which loads this file with Node's native TS support, hence the
// explicit .ts extension) and the app/scripts share one definition.
export { default } from './src/config/knex.ts';
