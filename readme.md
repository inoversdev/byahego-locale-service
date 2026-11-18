# ByaheGo Locale Service

A standalone REST API service that provides country, language, dialect, and locale information for ByaheGo Web and Mobile applications.

This guide explains how to set up the project from a fresh Git clone, configure the database, install dependencies, import localization datasets, and run the API.

---

## 1. Technology Stack

| Technology | Purpose |
|---|---|
| Node.js | JavaScript runtime |
| TypeScript | Application development |
| Express.js | REST API framework |
| MySQL | Database |
| Knex.js | Database migrations and query builder |
| CLDR | Country and language localization data |
| ISO 3166 | Country identifiers |
| ISO 639 | Language identifiers |
| Glottolog | Language families, languages, and dialect classifications |
| csv-parse | Processing Glottolog CSV datasets |
| tsx | Running TypeScript scripts |

## 2. Prerequisites

Before setting up the project, install the following:

- Node.js (v22 recommended)
- npm
- MySQL Server
- Git

Verify your installations:

```bash
node -v
npm -v
git --version
mysql --version
```

## 3. Clone the Repository

Clone the repository:

```bash
git clone YOUR_REPOSITORY_URL
```

Navigate into the project directory:

```bash
cd byahego-locale-service
```

Install the project dependencies:

```bash
npm install
```

## 4. Configure Environment Variables

Create your local environment file:

```bash
cp .env.example .env
```

If the repository does not contain an `.env.example`, create a `.env` file manually.

Example configuration:

```env
NODE_ENV=development

PORT=8090
APP_NAME=ByaheGo Locale Service
API_PREFIX=/api/v1

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=locale_service
DB_PASSWORD=YOUR_DATABASE_PASSWORD
DB_NAME=byahego_localedb
```

Update the database credentials according to your local MySQL configuration.

**Important:** Make sure the database name in `.env` matches the database you create and use during dataset imports.

Never commit your actual `.env` file to Git.

## 5. Create the MySQL Database

Log in to MySQL:

```bash
mysql -u root -p
```

Create the database:

```sql
CREATE DATABASE byahego_localedb
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;
```

Create a dedicated database user:

```sql
CREATE USER 'locale_service'@'localhost'
IDENTIFIED BY 'YOUR_DATABASE_PASSWORD';
```

Grant the necessary permissions:

```sql
GRANT ALL PRIVILEGES ON byahego_localedb.*
TO 'locale_service'@'localhost';

FLUSH PRIVILEGES;
```

Exit MySQL:

```sql
EXIT;
```

If you already have a database user, you can reuse that account instead of creating another one.

## 6. Run Database Migrations

The project uses Knex migrations to create the database tables.

Run:

```bash
npm run db:migrate
```

This should create the initial database tables, including:

- `countries`
- `languages`
- `country_languages`
- `locales`
- `dataset_imports`
- `glottolog_languoids`

The migration commands are:

| Command | Description |
|---|---|
| `npm run db:make -- migration_name` | Create a migration |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:rollback` | Roll back the latest migration |
| `npm run db:status` | Check migration status |

Do not manually create tables that are already managed by migrations.

## 7. Install and Prepare Localization Datasets

The service uses multiple datasets to build its localization database.

### 7.1 CLDR

CLDR provides localized names for countries and languages, along with supplemental territory-language information.

Install the packages:

```bash
npm install cldr-core cldr-localenames-full
```

The importer uses data from:

```text
node_modules/
├── cldr-core/
│   └── supplemental/
│       └── territoryInfo.json
└── cldr-localenames-full/
    └── main/
        └── en/
            ├── languages.json
            └── territories.json
```

No manual download is required when these packages are installed through npm.

### 7.2 ISO Country and Language Data

Install:

```bash
npm install i18n-iso-countries iso-639-3
```

These packages provide standardized country and language identifiers.

Country identifiers include:

- ISO 3166-1 alpha-2
- ISO 3166-1 alpha-3
- ISO 3166-1 numeric

Language identifiers include:

- ISO 639-1
- ISO 639-2
- ISO 639-3

### 7.3 Glottolog

Glottolog provides linguistic classification data, including language families, languages, and dialects.

Unlike CLDR, Glottolog is imported from its downloadable dataset.

1. Visit the official Glottolog website:

   https://glottolog.org/

2. Download the Glottolog languoid dataset.

3. Extract the downloaded archive.

4. Locate `languoid.csv`.

5. Place the file in the following project directory:

```text
byahego-locale-service/
└── datasets/
    └── glottolog/
        └── languoid.csv
```

The expected CSV columns include:

```text
id
family_id
parent_id
name
bookkeeping
level
latitude
longitude
iso639P3code
description
markup_description
child_family_count
child_language_count
child_dialect_count
country_ids
```

Install the CSV parser:

```bash
npm install csv-parse
```

**Important:** The Glottolog dataset is not a REST API. The service imports its data into MySQL so that the application can query it directly.

Check the Glottolog release version and retain its attribution and licensing information when distributing the dataset.

## 8. Configure Import Scripts

The project should have the following scripts in `package.json`:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit",

    "db:make": "knex --knexfile knexfile.ts migrate:make",
    "db:migrate": "knex --knexfile knexfile.ts migrate:latest",
    "db:rollback": "knex --knexfile knexfile.ts migrate:rollback",
    "db:status": "knex --knexfile knexfile.ts migrate:list",

    "cldr:import": "tsx src/scripts/import-cldr.ts",
    "iso:import": "tsx src/scripts/import-iso.ts",
    "glottolog:import": "tsx src/scripts/import-glottolog.ts"
  }
}
```

The import scripts are written in TypeScript and executed using `tsx`.

Using `tsx` avoids requiring a separate `ts-node` installation.

If `tsx` is not installed:

```bash
npm install -D tsx
```

## 9. Import the Datasets

After configuring the database and preparing the datasets, import them in the following order.

### Step 1: Import CLDR

```bash
npm run cldr:import
```

This imports country and language localization data, including country-language associations.

### Step 2: Import ISO Identifiers

```bash
npm run iso:import
```

This updates language records with their ISO identifiers.

### Step 3: Import Glottolog

```bash
npm run glottolog:import
```

This imports Glottolog's linguistic classification records into:

```text
glottolog_languoids
```

The imported records include:

- Language families
- Languages
- Dialects
- Parent and family relationships
- ISO 639-3 identifiers, where available
- Geographic coordinates, where available
- Associated country codes

**Import order matters.** Run the CLDR and ISO imports before Glottolog so that the importer can associate matching Glottolog language records with existing language records in the `languages` table.

## 10. Verify the Imported Data

Connect to MySQL:

```bash
mysql -u locale_service -p byahego_localedb
```

Check the countries:

```sql
SELECT COUNT(*) AS total_countries
FROM countries;
```

Check the languages:

```sql
SELECT COUNT(*) AS total_languages
FROM languages;
```

Check country-language associations:

```sql
SELECT COUNT(*) AS total_associations
FROM country_languages;
```

Check Glottolog classifications:

```sql
SELECT
    level,
    COUNT(*) AS total
FROM glottolog_languoids
GROUP BY level;
```

Check total Glottolog records:

```sql
SELECT COUNT(*) AS total_records
FROM glottolog_languoids;
```

Check linked language records:

```sql
SELECT COUNT(*) AS linked_languages
FROM glottolog_languoids
WHERE language_id IS NOT NULL;
```

Check Filipino and Tagalog records:

```sql
SELECT
    id,
    name,
    level,
    iso639_3,
    country_ids
FROM glottolog_languoids
WHERE name LIKE '%Filipino%'
   OR name LIKE '%Tagalog%';
```

Check dataset import history:

```sql
SELECT
    dataset,
    dataset_version,
    status,
    records_imported,
    started_at,
    completed_at
FROM dataset_imports
ORDER BY id DESC;
```

## 11. Run the API Locally

Start the development server:

```bash
npm run dev
```

The API should be available at:

```text
http://localhost:8090
```

Run TypeScript checks:

```bash
npm run typecheck
```

Build the project:

```bash
npm run build
```

Run the production build:

```bash
npm start
```

## 12. Current API Structure

The API uses the following prefix:

```text
/api/v1
```

Planned endpoints include:

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/countries` | Retrieve countries |
| GET | `/api/v1/countries/:code` | Retrieve country details |
| GET | `/api/v1/countries/:code/languages` | Retrieve languages associated with a country |
| GET | `/api/v1/languages` | Retrieve languages |
| GET | `/api/v1/languages/:code` | Retrieve language details |
| GET | `/api/v1/languages/:code/dialects` | Retrieve dialects associated with a language |
| GET | `/api/v1/locales` | Retrieve locales |
| GET | `/api/v1/locales/:code` | Retrieve locale details |
| GET | `/api/v1/search` | Search localization data |

## 13. Project Directory Structure

The expected project structure:

```text
byahego-locale-service/
│
├── datasets/
│   └── glottolog/
│       └── languid.csv
│
├── migrations/
│
├── src/
│   ├── config/
│   │   ├── database.ts
│   │   └── env.ts
│   │
│   ├── modules/
│   │   ├── countries/
│   │   ├── languages/
│   │   ├── dialects/
│   │   ├── locales/
│   │   └── search/
│   │
│   ├── routes/
│   │
│   ├── scripts/
│   │   ├── import-cldr.ts
│   │   ├── import-iso.ts
│   │   └── import-glottolog.ts
│   │
│   ├── app.ts
│   └── server.ts
│
├── .env
├── .env.example
├── .gitignore
├── knexfile.ts
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

Note: `languoid.csv` is the actual filename used by the importer.

## 14. Important Notes for Developers

### Dataset imports

Dataset imports should be executed when setting up a new environment or when updating the corresponding source dataset.

Do not run imports unnecessarily on every API startup.

### Glottolog limitations

Glottolog provides linguistic classification data, but it does not guarantee complete dialect coverage for every country.

Some regional varieties may be missing, and some records may not have ISO identifiers or geographic coordinates.

### Manual dialect management

The existing `glottolog_languoids` table can also be queried when building dialect-related functionality.

If manually adding dialect records, preserve the distinction between externally imported records and records created by ByaheGo. Avoid inventing identifiers that could conflict with future Glottolog imports.

### Environment and security

- Never commit `.env`.
- Use separate database credentials for development and production.
- Restrict access to administrative endpoints.
- Do not expose database credentials or internal errors through API responses.
- Keep imported dataset versions and attribution information.

---

## 15. Quick Setup Checklist

For a developer setting up the project for the first time:

- [ ] Install Node.js, npm, Git, and MySQL.
- [ ] Clone the repository.
- [ ] Run `npm install`.
- [ ] Configure `.env`.
- [ ] Create the MySQL database and user.
- [ ] Run `npm run db:migrate`.
- [ ] Download and extract the Glottolog dataset.
- [ ] Place `languoid.csv` inside `datasets/glottolog/`.
- [ ] Run `npm run cldr:import`.
- [ ] Run `npm run iso:import`.
- [ ] Run `npm run glottolog:import`.
- [ ] Verify imported records in MySQL.
- [ ] Run `npm run typecheck`.
- [ ] Start the API using `npm run dev`.

Once these steps are completed, the developer should have a working local instance of ByaheGo Locale Service.

## Web globe

A read-only 3D globe (three.js) is served at `/`. Click a country to see the languages and dialects stored for it.

```bash
npm run web:install   # first time only
npm run web:build     # builds web/dist, served by the API at /
npm run dev           # then open http://localhost:<PORT>/
```

For hot reload while developing the UI run `npm run web:dev` (http://localhost:5173, proxies `/api` to the service). The API must be running too (`npm run dev` in a second terminal), otherwise the page shows a 502 / "Can't reach the locale service" error. See `documents/implementation-docs.md`.
