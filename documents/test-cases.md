# Test Cases — Locale Service Manager (`npm run manage`)

**Prerequisites:** MySQL reachable with valid `DB_*` in `.env`; `npm run db:migrate` applied; CLDR, ISO and Glottolog imported at least once. Start the API with `npm run dev` for the API checks. There is no automated test suite in this service yet, so these are manual.

## Required parameters / validation reference
| Field | Rule |
|---|---|
| Country code | exactly 2 letters (uppercased), unique |
| Alpha-3 | 3 letters, unique, optional |
| Numeric code | 3 digits, optional |
| Language code (CLDR) | letters with optional `-subtags`, max 35, unique |
| ISO 639-1 / 639-3 | 2 / 3 lowercase letters, optional |
| Dialect name | required, max 255 |
| Latitude / longitude | decimals allowed (e.g. `16.88009`), -90..90 / -180..180, up to 7 decimals, both or neither |
| Population percent | decimals allowed (e.g. `64.5`), 0..100, up to 3 decimals, optional |

## Happy path
1. **Menu and exit.** `npm run manage` → main menu shows 5 options → *Exit* prints `Bye.` and the process ends.
2. **Add a dialect.** Dialects per country → search `Philippines` → *Add a new dialect* → name `Test Dialect`, parent `(none)`, leave optional fields blank → confirm. Expect `Added dialect x_00000N`. Then `GET /api/v1/countries/PH` lists it in `data.dialects`.
3. **List dialects.** *List dialects* shows id, name, parent, ISO, source (`manual`) and link source.
4. **Edit a manual dialect.** *Edit a manual dialect* → change name → list shows the new name.
5. **Link an existing dialect.** *Link an existing dialect to this country* → search `Achterhoeks` → pick. It then appears in the PH list (link `manual`) and in the API.
6. **Remove a manual link / dialect.** *Remove a manual link* removes the link only; *Remove a manual dialect* deletes the dialect and its links (confirm = Yes).
7. **Add a country.** Countries & languages → Countries → *Add a country* with an unused code (e.g. `QQ`) and a name. Row has `source=manual`.
8. **Edit a country.** Set native name, alpha-3 and numeric code; saved, and `GET /api/v1/countries/<code>` shows them.
9. **Add and edit a language**, then **add/edit/remove a country-language mapping** (official status and population percent).
10. **Dry run.** Run imports → *All datasets* → Dry run = Yes. Results table says `dry run`; the overview row counts and import history are unchanged.
11. **Real import.** Run *Glottolog* with Dry run = No → a `completed` row appears in history with the record count.
12. **History and overview.** *Import history & dataset overview* shows recent imports, latest versions, row counts (with manual counts) and levels.

## API: `GET /api/v1/countries/:code` languages
1. `GET /api/v1/countries/PH` → 200; `data.languages` exists and `data.dialects` does not.
2. All `type: "language"` items come before every `type: "dialect"` item. Languages are ordered by `population_percent` (highest first, e.g. English 64, Filipino 60), and dialects by name.
3. A language item has `code`, `official_status`, `population_percent` (a number) and `null` for `latitude`, `longitude`, `family_id` and `parent_id`. A dialect item has `null` for `code`, `native_name`, `official_status` and `population_percent`.
4. `GET /api/v1/countries/aq` (lowercase, few or no languages) → 200 with a short or empty `languages` list.
5. `GET /api/v1/countries/XX` → 404 `Country not found.`
6. Add a manual dialect to PH with the manager → it appears at the end of `data.languages` with `type: "dialect"`.

## Esc = go back
Run `npm run manage` and press **Esc** (allow about half a second for it to register):
1. Dialects menu (after choosing a country) → Esc → main menu.
2. Dialects → at the country search → Esc → main menu.
3. *Add a new dialect*, enter a name, then press Esc at *Parent language* → `Cancelled.` and you are back in the Dialects menu. Check that no row was added to `glottolog_languoids`.
4. Countries & languages → Countries → *Add a country* → Esc at *Country code* → `Cancelled.`, back in the Countries menu. Esc again → Countries & languages menu. Esc again → main menu.
5. Country languages → at the country search → Esc → back in the Countries & languages menu (no message).
6. Run imports → Esc at the dataset menu → main menu. Run imports → CLDR → Esc at the dry-run question → main menu, and no new row in `dataset_imports`.
7. Main menu → Esc → nothing happens, and the menu stays.
8. Arrow keys still move the selection (they must not act as Esc). Ctrl+C still exits with `Bye.`.
9. *Import history* → at *Press Enter to continue* press Esc → returns to the main menu.
10. Finish a normal add-dialect form without Esc → it still saves (regression check).

## Negative / error tests
1. Add a country with a code that already exists → "already exists", nothing written.
2. Add a country with a code like `P1` or `PHL` → rejected with the format hint.
3. Add a country with an alpha-3 already used elsewhere → refused with the owning country shown.
4. Add a language with an existing CLDR code → "already exists".
5. Dialect name left blank → "This field is required."
6. ISO 639-3 `AB1`, latitude `95`, longitude `-181`, population `101` → each is rejected at its prompt with a message (for example "Value must be between -90 and 90"). `abc` as a latitude → "You must provide a valid numeric value".
6a. **Decimals accepted:** latitude `16.88009`, longitude `120.5` → accepted and saved (a 9-decimal value is stored rounded to 7 decimals). Population `64.5` → accepted, stored as `64.500`. `0` and `-90` are valid latitudes.
6b. **Coordinates together:** give a latitude but leave longitude empty → "Latitude and longitude must be given together", both are asked again with the typed value kept. Leaving both empty is fine.
6c. **Edit keeps decimals:** edit a dialect that has coordinates → the current values show as defaults and Enter keeps them unchanged.
6d. **Duplicates at the prompt:** *Add a country* with code `PH` → "already exists" right at the code prompt; an alpha-3 already held by another country → "already used by …" at its prompt; *Add a language* with `en` → "already exists". Nothing is saved, and Esc cancels the form.
7. *Edit/Remove a manual dialect* in a country with only imported dialects → "No manual dialects…" message; imported dialects cannot be edited.
8. *Remove a manual link* where only imported links exist → explanatory message.
9. Stop MySQL (or break `DB_HOST`) → `npm run manage` prints "Could not connect to the database" and exits with code 1.
10. Remove an imported (CLDR) mapping → warning that the next CLDR import re-creates it.
11. Run *Glottolog* before CLDR on an empty DB → countries are missing, so `languoid_countries` stays empty (use the "All" option for the correct order).

## Edge cases
1. **Re-import keeps manual data.** Add a manual dialect, edit a country (native name) and a mapping, then run *All datasets* for real. All three edits are still present; imported links for the same dialects are rebuilt.
2. **Multi-country dialect.** `Achterhoeks` appears under both `GET /api/v1/countries/DE` and `/NL` as `type: "dialect"` items in `data.languages` (previously missed by `FIND_IN_SET`).
3. **Manual dialect ID sequence.** Two additions create `x_000001`, `x_000002`; after deleting the highest one, the next addition reuses that number.
4. **Cancel.** Ctrl+C at a prompt exits cleanly with the DB pool closed. Ctrl+C during a real import rolls back and marks the history row `failed` with `cancelled`.
5. **Search prompts.** Country search matches code or name (`ph`, `phil`); an empty search lists the first 20 alphabetically.
6. **Standalone scripts.** `npm run cldr:import`, `iso:import`, `glottolog:import` still run, log history and exit non-zero on failure.
7. **Migration.** `npm run db:rollback` then `npm run db:migrate` succeeds; backfill recreates the `languoid_countries` rows from `country_ids`.

## Role-based access
Not applicable: the tool runs locally with the DB credentials in `.env`, and the HTTP API stays public and read-only. Do not expose the tool to untrusted users.
