# Implementation Docs — Locale Service Manager (`npm run manage`)

## Summary of changes
- New interactive console tool, `npm run manage`, for managing locale data without touching SQL or running one-off scripts.
- Menu: **Dialects per country**, **Countries & languages**, **Run imports** (single/all, dry run), **Import history & dataset overview**.
- Manual data is protected: rows created or edited through the tool carry `source = 'manual'`, and imports skip them.
- `GET /api/v1/countries/:code` now returns a `languages` array (the country's languages first, then its dialects) instead of `dialects`.
- Fixed `GET /api/v1/countries/:code` dialect lookup. `country_ids` is whitespace-separated, but the old `FIND_IN_SET(?, country_ids)` expects commas, so multi-country dialects were never returned. The query now joins the new `languoid_countries` table.
- Import scripts were refactored into callable functions; the existing `npm run *:import` commands still work.

## Files affected
| File | Change |
|---|---|
| `migrations/20261116000000_add_manual_data_support.ts` | new: `source` column on `countries`, `languages`, `glottolog_languoids`; new `languoid_countries` table + backfill |
| `src/scripts/utils.ts` | new: `chunks`, `runInTransaction` (dry-run rollback), `runLoggedImport` (history rows), `runStandalone` |
| `src/scripts/import-cldr.ts`, `import-iso.ts`, `import-glottolog.ts` | exported `runCldrImport` / `runIsoImport` / `runGlottologImport(db, {dryRun})`; skip manual rows; Glottolog rebuilds `languoid_countries` |
| `src/modules/countries/country.service.ts` | dialect query joins `languoid_countries`; `getCountryByCode` returns languages + dialects as `languages` |
| `src/config/knex.ts`, `knexfile.ts` | knex config moved into `src` (so the build's `rootDir` contains it); `knexfile.ts` now re-exports it for the knex CLI |
| `src/cli/manage.ts` | new entry point and main menu |
| `src/cli/ui.ts` | new: prompt helpers (country/language search pickers, validated inputs) |
| `src/cli/menus/{dialects,countries,imports,history}.ts` | new menus |
| `package.json` | `manage` script, `@inquirer/prompts` dependency |
| `documents/` | master plan, this file, `test-cases.md` |

## Architecture notes
- **Manual markers:** `source` is `import` (default) or `manual`. `country_languages` already had `source` (`CLDR`); manual rows there use `manual`.
- **Import protection:** CLDR loads the keys of manual countries, languages and mappings and excludes them from its upserts. ISO skips manual languages. Glottolog IDs are alphanumeric, so manual dialect IDs (`x_000001`, `x_000002`, ...) cannot collide with the CSV.
- **`languoid_countries`** (`languoid_id`, `country_code`, `source`; composite PK, cascading FKs). Glottolog import deletes and rebuilds only `source='import'` links, so manual links survive. The original `country_ids` text column is kept.
- **Dry run:** the whole import runs in one transaction that is always rolled back; no `dataset_imports` row is written.
- **Cancel:** Ctrl+C during an import drops the transaction (rollback) and marks any `running` history row `failed` with `{"cancelled": true}`.
- **Edit rules:** imported dialects are read-only in the tool (edits would be lost on re-import). Manual dialects can be edited/removed. Existing dialects can be linked to a country (manual link). Editing an imported country, language or mapping flips it to `manual`.
- **Known limitation:** deleting an imported (`CLDR`) mapping is temporary — the next CLDR import re-creates it. The tool warns about this.

## API changes
- No new endpoints, no auth changes.
- **Breaking:** `GET /api/v1/countries/:code` no longer returns `dialects`. `data.languages` replaces it: the country's languages (from `country_languages`, ordered by `population_percent` descending, then name) followed by its dialects (ordered by name). No other repo consumed `dialects` at the time of the change.
- The CLDR placeholder `und` ("Unknown language", mapped to AQ, CP and HM) is excluded from `languages`.
- Each `languages` item has a `type` of `language` or `dialect` and one shared shape (`null` where a field doesn't apply):

  | Field | `language` | `dialect` |
  |---|---|---|
  | `id` | language ID as a string | Glottolog or manual ID (`x_000001`) |
  | `name` | English name | name |
  | `native_name`, `code` (CLDR), `iso639_1` | value | `null` |
  | `iso639_3` | value | value |
  | `official_status`, `population_percent` | value | `null` |
  | `family_id`, `parent_id`, `latitude`, `longitude` | `null` | value |

  Example: `{"success":true,"data":{"code":"PH","name":"Philippines","languages":[{"type":"language","id":"156","name":"English","code":"en","official_status":"official","population_percent":64,...},{"type":"dialect","id":"acht1238",...}]}}`
- Dialects linked to a country through more than one country (previously missed) and manually added or linked dialects now appear in the list.

## Configuration / environment
- No new environment variables. The tool reads the same `DB_*` values as `knexfile.ts`. Note: the password variable is `DB_PASS` (`.env.example` says `DB_PASSWORD`; not changed here).
- New dependency: `@inquirer/prompts` ^8.
- Run `npm run db:migrate` before first use (and `npm run db:rollback` reverts it).

## Usage notes
- Start: `npm run manage`. Navigate with arrow keys, type in search prompts, **Ctrl+C** exits.
- Add a dialect: Dialects per country → pick a country → *Add a new dialect* → name, optional parent language / ISO 639-3 / coordinates / description → confirm.
- Run imports in the order CLDR → ISO → Glottolog (the "All" option does this). Try *Dry run* first.
- Standalone scripts are unchanged: `npm run cldr:import`, `iso:import`, `glottolog:import`.
