import { Knex } from 'knex';
import { input, number, search, select } from '@inquirer/prompts';

export const BACK = '__back__';

export const printTable = (
  rows: Record<string, unknown>[],
  emptyMessage = 'No records found.'
): void => {
  if (rows.length === 0) {
    console.log(`\n${emptyMessage}\n`);
    return;
  }

  console.log();
  console.table(rows);
};

export const pause = async (): Promise<void> => {
  await input({ message: 'Press Enter to continue' });
};

/** Optional/required text prompt that returns a trimmed string or null. */
export const askText = async (
  message: string,
  options: {
    required?: boolean;
    default?: string | null;
    pattern?: RegExp;
    patternHint?: string;
    maxLength?: number;
    transform?: (value: string) => string;
  } = {}
): Promise<string | null> => {
  const value = await input({
    message: options.required ? message : `${message} (optional)`,
    default: options.default ?? undefined,
    validate: (raw) => {
      const text = raw.trim();

      if (!text) {
        return options.required ? 'This field is required.' : true;
      }

      if (options.maxLength && text.length > options.maxLength) {
        return `Maximum ${options.maxLength} characters.`;
      }

      if (options.pattern && !options.pattern.test(options.transform ? options.transform(text) : text)) {
        return options.patternHint ?? 'Invalid format.';
      }

      return true;
    }
  });

  const text = value.trim();

  if (!text) {
    return null;
  }

  return options.transform ? options.transform(text) : text;
};

export const askNumber = async (
  message: string,
  options: { min: number; max: number; default?: number | null }
): Promise<number | null> => {
  const value = await number({
    message: `${message} (optional, ${options.min} to ${options.max})`,
    default: options.default ?? undefined,
    required: false,
    min: options.min,
    max: options.max
  });

  return value === undefined ? null : value;
};

export const pickCountry = async (
  db: Knex,
  message = 'Search a country (name or code)'
): Promise<string> =>
  search<string>({
    message,
    source: async (term) => {
      const query = db('countries').select('code', 'name').orderBy('name').limit(20);

      if (term?.trim()) {
        const like = `%${term.trim()}%`;
        query.where((builder) =>
          builder.where('name', 'like', like).orWhere('code', 'like', like)
        );
      }

      const rows = await query;

      return rows.map((row: { code: string; name: string }) => ({
        name: `${row.code} — ${row.name}`,
        value: row.code
      }));
    }
  });

export const pickLanguage = async (
  db: Knex,
  message = 'Search a language (name, CLDR or ISO code)'
): Promise<number> =>
  search<number>({
    message,
    source: async (term) => {
      const query = db('languages')
        .select('id', 'cldr_code', 'english_name', 'iso639_3')
        .orderBy('english_name')
        .limit(20);

      if (term?.trim()) {
        const like = `%${term.trim()}%`;
        query.where((builder) =>
          builder
            .where('english_name', 'like', like)
            .orWhere('cldr_code', 'like', like)
            .orWhere('iso639_3', 'like', like)
        );
      }

      const rows = await query;

      return rows.map(
        (row: {
          id: number;
          cldr_code: string;
          english_name: string;
          iso639_3: string | null;
        }) => ({
          name: `${row.english_name} [${row.cldr_code}${row.iso639_3 ? `/${row.iso639_3}` : ''}]`,
          value: row.id
        })
      );
    }
  });

/** Generic "pick one of these rows" helper with a Back option. */
export const pickFromList = async <T extends string | number>(
  message: string,
  choices: { name: string; value: T }[]
): Promise<T | typeof BACK> =>
  select<T | typeof BACK>({
    message,
    choices: [...choices, { name: '← Back', value: BACK }]
  });
