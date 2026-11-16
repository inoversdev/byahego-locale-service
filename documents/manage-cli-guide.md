
`npm run manage` is an interactive console tool for maintaining the locale service's data: dialects, countries, languages, and the CLDR / ISO / Glottolog imports. It replaces hand-written SQL and the one-off import scripts for day-to-day work.

Use it when you want to:
- add, fix or remove a dialect, country, language or country-language mapping,
- refresh the reference data from CLDR, ISO 639 or Glottolog (with a safe dry run),
- check what has been imported and how much data is in each table.

For design details see [implementation-docs.md](implementation-docs.md). For a manual QA checklist see [test-cases.md](test-cases.md).

---

## 1. Before you start

1. **Database settings.** `.env` must contain valid `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME` and the password in **`DB_PASS`**. (`.env.example` says `DB_PASSWORD`, but the code reads `DB_PASS`.)
2. **Apply migrations** (once, and after pulling new ones):
   ```bash
   npm run db:migrate
   ```
3. **Load the base data** (first time only). The order matters:
   ```bash
   npm run cldr:import
   npm run iso:import
   npm run glottolog:import
   ```
   You can also do this from the manager with **Run imports → All datasets**.

If the database cannot be reached, the manager prints `Could not connect to the database` and exits.

## 2. Starting and navigating

```bash
npm run manage
```

| Key | Action |
|---|---|
| ↑ / ↓ | Move through a menu |
| Enter | Select / confirm |
| Type | Filter in search prompts (countries, languages, dialects) |
| Ctrl+C | Exit from anywhere |

Every submenu has a **← Back** option. Optional fields say `(optional)`; leave them empty and press Enter to skip. Prompts that edit something show the current value as the default, so press Enter to keep it.

The main menu:

```
What do you want to manage?
❯ Dialects per country
  Countries & languages
  Run imports
  Import history & dataset overview
  Exit
```

---

## 3. Dialects per country

Choose **Dialects per country**, then search for a country by name or code (for example `phil` or `PH`) and press Enter.

| Option | What it does |
|---|---|
| List dialects | Shows id, name, parent language, ISO code, `source` (`import` or `manual`) and how it is linked to this country |
| Add a new dialect | Creates a manual dialect and links it to this country |
| Edit a manual dialect | Changes name, ISO code, coordinates or description |
| Remove a manual dialect | Deletes it and all of its country links |
| Link an existing dialect to this country | Attaches a Glottolog dialect that is missing from this country |
| Remove a manual link | Removes a link you added; the dialect stays |
| Choose another country | Switches country without going back |

### Example: add a dialect to the Philippines

1. **Dialects per country** → type `Philippines` → Enter.
2. **Add a new dialect**.
3. Fill in the prompts:

   | Prompt | Notes |
   |---|---|
   | Dialect name | Required, up to 255 characters |
   | Parent language | Search by name, or pick `(none)` |
   | ISO 639-3 code | Optional, three lowercase letters |
   | Latitude / Longitude | Optional, -90 to 90 and -180 to 180 |
   | Description | Optional |

4. Confirm with **Yes**. The tool prints `Added dialect x_000001 (…) to PH.`

Manual dialects get IDs of the form `x_000001`, `x_000002`, … so they can never clash with Glottolog IDs.

**Imported dialects are read-only.** A Glottolog re-import would overwrite any edit. If an imported dialect is missing from a country, use **Link an existing dialect** instead (search starts after you type at least one character).

---

## 4. Countries & languages

Choose **Countries & languages**, then one of three areas.

### Countries
- **Add a country** — code, name, optional native name, alpha-3 and numeric code.
- **Edit a country** — pick it from the search, change any field.

### Languages
- **Add a language** — CLDR code, English name, optional native name and ISO codes.
- **Edit a language** — pick it from the search, change any field.

### Country languages
Pick a country, then:
- **List languages** — official status, population percent and source.
- **Add or update a language** — pick a language, an official status (`official`, `de_facto_official`, `official_regional` or none) and an optional population percent.
- **Edit a mapping** / **Remove a mapping**.

### Field rules

| Field | Rule |
|---|---|
| Country code | Exactly 2 letters, saved uppercase, must be new |
| Alpha-3 | 3 letters, unique across countries |
| Numeric code | 3 digits |
| Language code | Letters with optional `-subtags`, max 35 characters, must be new |
| ISO 639-1 / 639-3 | 2 / 3 lowercase letters |
| Population percent | 0 to 100 |

Invalid input is rejected on the spot with a hint, so you can correct it and continue.

---

## 5. Run imports

Choose **Run imports**, then:

1. Pick a dataset:
   - **CLDR** — countries, languages, country languages
   - **ISO 639** — language codes
   - **Glottolog** — languoids and dialects
   - **All datasets** — runs CLDR → ISO → Glottolog in the required order
2. **Dry run?** Defaults to **Yes**. A dry run does all the work inside a transaction and then rolls it back: nothing is saved and no history row is written. Use it to see the counts first.
3. Confirm. A results table shows the dataset, version, mode (`dry run` or `saved`) and number of records.

Notes:
- Run **CLDR first** on a new database. ISO and Glottolog depend on its countries and languages. With **All datasets** this is handled for you.
- If one dataset fails, the run stops, and datasets that already finished stay saved.
- **Ctrl+C during an import** rolls back the running dataset and marks its history row `failed` with a `cancelled` note.

---

## 6. Import history & dataset overview

This screen is read-only and shows four tables:

| Table | Meaning |
|---|---|
| Recent imports | Last 20 runs: dataset, version, status (`completed`, `failed`, `running`), records, start/end time, and an error or `cancelled` note |
| Latest completed version per dataset | The version currently loaded for CLDR, ISO 639 and Glottolog |
| Row counts | Total rows per table and how many of them are `manual` |
| Glottolog languoids by level | Counts of families, languages and dialects |

Press Enter to return to the main menu.

---

## 7. Manual versus imported data

Every country, language, dialect and mapping has a `source`:

- **`import`** (or `CLDR` for mappings) — came from a dataset. Re-imports update it.
- **`manual`** — created or edited through this tool. **Imports never overwrite or delete it.**

Rules to remember:
- Editing an imported country, language or mapping turns it into a `manual` row, so your change is kept.
- Imported dialects cannot be edited here; add a manual dialect or link one instead.
- Removing a mapping that came from CLDR is temporary: the next CLDR import creates it again. The tool warns you before you confirm.
- Links between dialects and countries are rebuilt from Glottolog on each Glottolog import. Links you created are kept.

---

## 8. Checking your changes through the API

Start the API (`npm run dev`) and request the country. The port comes from `PORT` in `.env`.

```bash
curl http://localhost:8090/api/v1/countries/PH
```

Your new dialect appears in `data.languages` as an item with `type: "dialect"`, after the country's languages (`type: "language"`). Dialects shared by several countries appear under each of those countries.

---

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Could not connect to the database` | Check `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` in `.env`, and that MySQL is running |
| `Action failed: … doesn't exist` or unknown column `source` | Migrations are missing — run `npm run db:migrate` |
| "… already exists" when adding | The code is taken. Use the matching **Edit** option |
| "No manual dialects to edit" | The country only has imported dialects, which are read-only |
| Dialect links are empty after an import | CLDR has not been loaded, so Glottolog could not find the countries. Run **All datasets** |
| A removed CLDR mapping came back | Expected, see section 7 |
| Dry run shows counts but nothing changes | Expected, dry runs never save |

## 10. Quick reference

| Command | Purpose |
|---|---|
| `npm run manage` | Open the interactive manager |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:rollback` | Undo the latest migration batch |
| `npm run db:status` | List applied and pending migrations |
| `npm run cldr:import` | Standalone CLDR import (no menu, saves immediately) |
| `npm run iso:import` | Standalone ISO 639 import |
| `npm run glottolog:import` | Standalone Glottolog import |
| `npm run dev` | Start the API with auto-reload |
