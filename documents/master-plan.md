# Plan: `npm run manage` — interactive console manager for byahego-locale-service

## Context
The locale service (`byahego-locale-service`, Express 5 + TS + MySQL/knex) is read-only over HTTP. Its data is loaded by three one-off scripts (`cldr:import`, `iso:import`, `glottolog:import`) and there is no way to fix or extend the data, or to see what was imported. The user wants a console command, `npm run manage`, with a menu to manage it. Chosen scope:
- Dialects per country (e.g. add a dialect to a country)
- Countries, languages, and country-language mappings
- Run imports (single or all, with dry run)
- Import history and dataset overview
- Menu built with `@inquirer/prompts`. No HTTP or auth work, since this is local console only.

## Findings that shape the design
1. **Re-imports would wipe manual edits.** All three importers do `.onConflict().merge()` (`src/scripts/import-glottolog.ts:~118`, `import-cldr.ts:~57-61`). Manual data needs a `source` marker, and imports must skip manual rows.
2. **Dialect-country linking is currently broken.** `glottolog_languoids.country_ids` is **space-separated** (`"AD ES FR IT"`), but `getCountryByCode` uses `FIND_IN_SET(?, country_ids)`, which expects commas (`src/modules/countries/country.service.ts:~77-119`). Multi-country dialects never match, and it is also a full table scan. The manager needs a reliable link, so this is replaced by a join table.
3. Each import script owns its own knex instance and calls `db.destroy()` in `finally`, so they cannot be called from a menu yet. They need a small refactor.
4. Glottocodes are alphanumeric, so manual dialect IDs of the form `x_000001` (fits `string(8)`) can never collide with imported IDs.

## Changes

### 1. Migration `migrations/<ts>_add_manual_data_support.ts`
- Add `source` varchar(20) NOT NULL default `'import'` to `countries`, `languages`, `country_languages` and `glottolog_languoids` (values: `import` | `manual`).
- Create `languoid_countries` with `languoid_id` (string 8, FK to `glottolog_languoids.id`, cascade), `country_code` (char 2, FK to `countries.code`, cascade), `source` (`import`|`manual`), and a composite PK on (`languoid_id`, `country_code`).
- Backfill `languoid_countries` from `country_ids` by splitting on whitespace and skipping unknown country codes.
- A `down` migration reverses all of this.

### 2. Refactor importers into callable functions
- Files: `src/scripts/import-cldr.ts`, `import-iso.ts`, `import-glottolog.ts`.
- Each exports `runXImport(db: Knex, opts: { dryRun: boolean }): Promise<ImportResult>`, where the result contains `records_imported` and `metadata`.
- Each keeps its standalone CLI entry behind `if (require.main === module)`. This means the existing npm scripts still work, and only the entry owns `knex()` and `destroy()`.
- Dry run: do all work inside one transaction and `rollback()` at the end. Return the counts but write no `dataset_imports` row.
- Protect manual data:
  - The CLDR import and the Glottolog import first load the keys of rows where `source='manual'` and exclude those from the insert/merge.
  - Glottolog import also rewrites `languoid_countries` only for `source='import'` rows (delete, then insert from `country_ids`).
- Reuse the existing `chunks` helper. It is duplicated across scripts, so move it to `src/scripts/utils.ts`.

### 3. Fix the public dialect query
`src/modules/countries/country.service.ts` (`getCountryByCode`): replace `FIND_IN_SET(?, country_ids)` with a join on `languoid_countries` filtered by `country_code`. It becomes indexed, handles multi-country dialects, and shows manual dialects through the API.

### 4. CLI (new, `src/cli/`)
- `manage.ts` is the entry point. It runs a main-menu loop with `select` and exits cleanly on Ctrl+C. It opens one shared knex instance (from `knexfile.ts`) and destroys it on exit.
- `ui.ts` holds shared helpers: a country picker (`search` prompt over `countries`), a language picker, `confirm`, and table printing with `console.table`.
- `menus/dialects.ts` works per country: it picks a country and then does one of the following.
  - **List:** show dialects with their source.
  - **Add:** prompt for name, parent language (searchable), optional ISO 639-3, optional lat/lon and description. It inserts a `glottolog_languoids` row with `level='dialect'`, `source='manual'`, and an ID of the form `x_######` generated from the next number. It then inserts a `languoid_countries` row.
  - **Edit and remove:** manual dialects only. Imported dialects are read-only, because edits would be overwritten on re-import.
  - **Attach or detach:** link an existing Glottolog dialect to this country with a manual `languoid_countries` row. Re-imports leave these rows alone.
- `menus/countries.ts` covers countries, languages and country-language mappings (official status, population percent).
  - It can add or edit a country (name, native name, alpha-3, numeric code), add or edit a language, and add, edit or remove a mapping.
  - Any edit to an imported row sets `source='manual'`, so later imports skip it.
- `menus/imports.ts`:
  - Choose CLDR, ISO, Glottolog, or All (the order CLDR, ISO, Glottolog is enforced).
  - Choose a dry-run toggle, then confirm.
  - Run through the exported functions and print the result.
  - Cancel is Ctrl+C. The transaction rolls back, and a SIGINT handler marks any `running` `dataset_imports` row as `failed` with `{cancelled: true}`.
- `menus/history.ts`:
  - The last 20 `dataset_imports` rows (dataset, version, status, count, started and completed times, error).
  - The latest completed version per dataset.
  - Row counts for `countries`, `languages`, `country_languages`, `glottolog_languoids` (by level and source) and `languoid_countries`.

### 5. Package changes
- `package.json`: add the script `"manage": "tsx src/cli/manage.ts"` and the dependency `@inquirer/prompts`.
- Confirm the `typescript` ^7 and `@types/node` ^26 versions actually installed still typecheck.

### 6. Deliverables required by CLAUDE.md
Write `documents/implementation-docs.md` and `documents/test-cases.md` under the repo's `documents/` folder, and write the approved plan to `documents/master-plan.md` first.

## Not in scope (flagged, not changed)
- `.env.example` uses `DB_PASSWORD`, but the code reads `DB_PASS`. The port also differs (8082 in the example, 8090 as the code default). Worth a separate fix.
- `alpha3_code`, `numeric_code` and `native_name` are never populated by the importers. The manager can set them by hand, but a bulk fill from `i18n-iso-countries` would be its own task.
- No HTTP admin API, auth, central Express error handler or CORS wiring.

## Verification
1. `npm run typecheck` is clean, and `npm run db:migrate` applies the new migration (`npm run db:rollback` also works).
2. Standalone `npm run cldr:import`, `iso:import` and `glottolog:import` still work after the refactor.
3. In `npm run manage`, a Glottolog dry run leaves the row counts in the overview unchanged and writes no history row.
4. Add a dialect to a country (for example PH), then call `GET /api/v1/countries/PH`. The dialect is returned, and an existing multi-country dialect such as one linked to `AD ES FR IT` now appears for each of those countries.
5. Re-run `glottolog:import` and `cldr:import`. The manual dialect, the edited country, and the manual mapping are all still present.
6. Edit and remove work on manual dialects, and the menu refuses them on imported dialects.
7. Ctrl+C at the menu exits with the DB pool closed. Ctrl+C mid-import marks the history row as failed with `cancelled: true`.

## Implementation notes (deviations from the plan)
- `country_languages` already had a NOT NULL `source` column (value `CLDR`), so the migration does **not** add one there. Manual rows use `source = 'manual'`; the other three tables got a new `source` column (default `import`).
- ISO import now also writes a `dataset_imports` row (dataset `ISO 639`), so it appears in history.
- Dry-run support lives in `runInTransaction` (`src/scripts/utils.ts`), which rolls back via a sentinel error.

---

# Plan: Globe web app (three.js) served by the locale service

Goal: visiting `/` shows an interactive 3D globe; clicking a country shows the data stored for it (country, languages, dialects). Read-only. Decisions: Vite + TypeScript app in `web/`, served by Express from `web/dist`; tint by data, dialect markers, country search.

| Order | Agent | Task | Status |
|-------|-------|------|--------|
| 1 | `claude` | Backend: `GET /api/v1/countries/summary` + static serving of `web/dist` at `/` | [x] Completed |
| 2 | `claude` | Frontend: `web/` Vite + TS + three.js globe, panel, search, legend | [x] Completed |
| 3 | `claude` | Verify (headless Chrome), docs (`implementation-docs.md`, `test-cases.md`, `readme.md`) | [x] Completed |

Implementation notes:
- Country shapes come from `world-atlas` (50m TopoJSON, numeric ISO ids mapped with `i18n-iso-countries`); Kosovo has no id and is matched by name to `XK`. Territories without a code (Somaliland, N. Cyprus, ...) are drawn but not selectable.
- Picking: an offscreen id-map gives a candidate in O(1); every candidate is verified with `geoContains` because anti-aliased edge pixels are blends.
