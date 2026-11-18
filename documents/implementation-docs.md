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
| `src/cli/ui.ts` | new: prompt helpers (country/language search pickers, validated inputs); every prompt is wrapped so **Esc** aborts it (`AbortSignal`) and throws `GoBack`; `menu()` turns Esc into the "back" choice, `attempt()` turns it into "Cancelled." and stays in the menu |
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

---

# Globe web app

## Summary of changes
- New read-only web app: a three.js globe at `/`. Countries are tinted by how many languages + dialects are stored (log scale), hover shows a tooltip, click (or the search box) opens a details panel with the country, its languages (official status, population %) and its dialects. Dialects with coordinates appear as markers on the globe; clicking a dialect in the panel turns the globe to it.
- New endpoint `GET /api/v1/countries/summary`.
- Express serves the built app from `web/dist`.

## Files affected
- `src/modules/countries/country.service.ts`: `getCountriesSummary()`.
- `src/modules/countries/country.controller.ts`, `country.routes.ts`: `/summary` route (registered before `/:code`).
- `src/app.ts`: serves `web/dist` and `index.html` at `/` when built; otherwise `/` keeps the JSON status response.
- `package.json`: scripts `web:install`, `web:dev`, `web:build`, `web:typecheck`.
- New `web/` (own `package.json` and `tsconfig.json`): `index.html`, `vite.config.ts`, `src/{main,globe,geo,api,panel,search,dom,theme}.ts`, `src/styles.css`.

## Architecture notes
- One sphere with an equirectangular canvas texture (4096x2048) drawn once with `d3-geo`; a second transparent overlay texture is redrawn only on hover/selection change.
- Picking: ray → sphere hit → lat/lon → pixel in an offscreen id-map (candidate) → verified with `geoContains`. The globe never rotates; the camera orbits (`OrbitControls`).
- When the panel opens, `camera.setViewOffset` centres the globe in the uncovered area (right side on desktop, top part on phones).
- Selection is mirrored in the URL hash (`/#PH`), so countries can be linked.
- `web/` has its own dependencies so the backend install and production runtime stay lean. `world-atlas` JSON is a separate lazy-loaded asset.

## API changes
`GET /api/v1/countries/summary` (no auth, same as the other country routes; `Cache-Control: public, max-age=300`)
```json
{ "success": true, "data": [ { "code": "PH", "name": "Philippines", "language_count": 19, "dialect_count": 16 } ] }
```
Counts exclude the CLDR placeholder language `und`; dialects are `glottolog_languoids.level = 'dialect'` linked through `languoid_countries`. Existing endpoints are unchanged.

## Configuration / environment
- `web/.env` (build time): `VITE_API_BASE` = API origin the page calls (e.g. `https://locale-api.example.com`). Empty/unset = same origin (Express-served page or the Vite dev proxy). A trailing slash is tolerated. Changing it needs `npm run web:build` again. See `web/.env.example`.
- Service `.env`: `CORS_ORIGINS` = comma-separated browser origins allowed to call the API (`*` = any, unset = no CORS headers). Needed only when the page is hosted on a different origin. Enabled for `GET, HEAD, OPTIONS` only, no credentials (`src/config/env.ts`, `src/app.ts`, uses the existing `cors` package; `@types/cors` added).
- The Vite dev proxy reads `PORT` from the service `.env` (default 8090).
- If the page is served over `https`, `VITE_API_BASE` must be `https` too (browsers block mixed content), and the API URL must be reachable from the user's browser, not only from the server.

## Usage notes
- Production: `npm run web:install && npm run web:build && npm run build && npm start`, then open `http://localhost:<PORT>/`.
- Development: run `npm run dev` (API) and `npm run web:dev` (http://localhost:5173, proxies `/api`) in two terminals. If the API is not running the Vite proxy answers 502 and the page shows "Can't reach the locale service" with a Retry button.
- If `web/dist` is not built, `/` returns the old JSON status response.
- Separate static host: either set `VITE_API_BASE` + `CORS_ORIGINS` (no proxy) or proxy `/api`. Without either, `/api` must be proxied to the service (`deploy/nginx.conf.example`). Without it the host answers `/api/...` with `index.html` (HTTP 200, not JSON) and the page shows "The server answered with a web page instead of API data" (previously the generic "Request failed (200)").
- Countries missing from the 50m map (some micro-states) still open in the panel via search, but cannot be highlighted or flown to.
- Keyboard: search is a combobox (arrow keys, Enter, Esc); `Esc` closes the panel. Reduced-motion users get no auto-rotate and no camera animation.

## Branding (globe web app)
- Colours and font mirror the ByaheGo identity in `dortel-web/src/index.css`: Sunset Coral `#ff6b4a` (accent), Midnight Indigo `#101a3a` / `#18264f` (surfaces), Warm Cloud `#f7f8fc` (text), Nunito (bundled with `@fontsource/nunito`, no CDN). The page stays dark. If the brand changes, update both places: `web/src/styles.css` (`:root` tokens) and `web/src/theme.ts` (map colours).
- Official logo files are copied unmodified from `dortel-web/public/` into `web/public/` (`ByahegoGoGlyph.png` in the header, `favicon-go.png` as favicon).
- White on coral is only ~2.9:1, so text on coral (buttons, "Official" badge) uses deep indigo (~6:1). Contrast of all text and map pairs was checked (text ≥ 4.5:1, map/UI ≥ 3:1).
- Data tint ramp: periwinkle → Sunset Coral → sunrise yellow; "no data" is muted indigo. Dialect markers are white dots with an indigo halo (active marker: coral, larger).
