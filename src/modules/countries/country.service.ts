
import { RowDataPacket } from 'mysql2';
import pool from '../../config/database';

interface Country extends RowDataPacket {
  code: string;
  alpha3_code: string | null;
  numeric_code: string | null;
  name: string;
  native_name: string | null;
}

interface CountResult extends RowDataPacket {
  total: number;
}

interface GetCountriesParams {
  search?: string;
  limit: number;
  offset: number;
}

interface Dialect extends RowDataPacket {
  id: string;
  family_id: string | null;
  parent_id: string | null;
  name: string;
  iso639_3: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface CountryLanguage extends RowDataPacket {
  id: number;
  name: string;
  native_name: string | null;
  cldr_code: string;
  iso639_1: string | null;
  iso639_3: string | null;
  official_status: string | null;
  population_percent: string | number | null;
}

export interface CountryLanguageItem {
  type: 'language' | 'dialect';
  id: string;
  name: string;
  native_name: string | null;
  code: string | null;
  iso639_1: string | null;
  iso639_3: string | null;
  official_status: string | null;
  population_percent: number | null;
  family_id: string | null;
  parent_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

const toNumberOrNull = (value: string | number | null): number | null =>
  value === null || value === undefined ? null : Number(value);

export const getCountries = async ({
  search,
  limit,
  offset
}: GetCountriesParams) => {
  const whereClause = search
    ? `WHERE code LIKE ?
       OR alpha3_code LIKE ?
       OR name LIKE ?
       OR native_name LIKE ?`
    : '';

  const searchParams = search
    ? Array(4).fill(`%${search}%`)
    : [];

  const [countries] = await pool.execute<Country[]>(
    `SELECT
      code,
      alpha3_code,
      numeric_code,
      name,
      native_name
    FROM countries
    ${whereClause}
    ORDER BY name ASC
    LIMIT ? OFFSET ?`,
    [...searchParams, limit, offset]
  );

  const [countResult] = await pool.execute<CountResult[]>(
    `SELECT COUNT(*) AS total
     FROM countries
     ${whereClause}`,
    searchParams
  );

  return {
    data: countries,
    total: countResult[0].total
  };
};


export const getCountryByCode = async (code: string) => {
  const countryCode = code.toUpperCase();

  const [countries] = await pool.execute<Country[]>(
    `SELECT
      code,
      alpha3_code,
      numeric_code,
      name,
      native_name
    FROM countries
    WHERE code = ?
    LIMIT 1`,
    [countryCode]
  );

  const country = countries[0];

  if (!country) {
    return null;
  }

  const [[languageRows], [dialectRows]] = await Promise.all([
    pool.execute<CountryLanguage[]>(
      `SELECT
        l.id,
        l.english_name AS name,
        l.native_name,
        l.cldr_code,
        l.iso639_1,
        l.iso639_3,
        cl.official_status,
        cl.population_percent
      FROM country_languages cl
      INNER JOIN languages l ON l.id = cl.language_id
      WHERE cl.country_code = ?
      ORDER BY cl.population_percent DESC, l.english_name ASC`,
      [countryCode]
    ),
    pool.execute<Dialect[]>(
      `SELECT
        gl.id,
        gl.family_id,
        gl.parent_id,
        gl.name,
        gl.iso639_3,
        gl.latitude,
        gl.longitude
      FROM glottolog_languoids gl
      INNER JOIN languoid_countries lc ON lc.languoid_id = gl.id
      WHERE gl.level = 'dialect'
        AND lc.country_code = ?
      ORDER BY gl.name ASC`,
      [countryCode]
    )
  ]);

  // Languages first, then dialects, in one list.
  const languages: CountryLanguageItem[] = [
    ...languageRows.map(
      (row): CountryLanguageItem => ({
        type: 'language',
        id: String(row.id),
        name: row.name,
        native_name: row.native_name,
        code: row.cldr_code,
        iso639_1: row.iso639_1,
        iso639_3: row.iso639_3,
        official_status: row.official_status,
        population_percent: toNumberOrNull(row.population_percent),
        family_id: null,
        parent_id: null,
        latitude: null,
        longitude: null
      })
    ),
    ...dialectRows.map(
      (row): CountryLanguageItem => ({
        type: 'dialect',
        id: row.id,
        name: row.name,
        native_name: null,
        code: null,
        iso639_1: null,
        iso639_3: row.iso639_3,
        official_status: null,
        population_percent: null,
        family_id: row.family_id,
        parent_id: row.parent_id,
        latitude: toNumberOrNull(row.latitude),
        longitude: toNumberOrNull(row.longitude)
      })
    )
  ];

  return {
    ...country,
    languages
  };
};
