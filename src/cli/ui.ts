import readline from 'readline';
import { Knex } from 'knex';
import {
  input as rawInput,
  number as rawNumber,
  search as rawSearch,
  select as rawSelect,
  confirm as rawConfirm
} from '@inquirer/prompts';

export const BACK = '__back__';

/** Thrown by any prompt when the user presses Esc. */
export class GoBack extends Error {
  constructor() {
    super('Go back');
    this.name = 'GoBack';
  }
}

// Make sure stdin emits `keypress` events (inquirer's readline does this too).
readline.emitKeypressEvents(process.stdin);

/**
 * Runs a prompt that can be cancelled with Esc. Esc aborts the prompt through
 * its AbortSignal, and we surface that as `GoBack`. Ctrl+C is untouched.
 * Note: Node reports a lone Esc after a short escape-sequence timeout (~0.5s).
 */
const escapable = async <R>(
  run: (context: { signal: AbortSignal }) => Promise<R>
): Promise<R> => {
  const controller = new AbortController();

  const onKeypress = (_chunk: unknown, key?: { name?: string }): void => {
    if (key?.name === 'escape') controller.abort();
  };

  process.stdin.on('keypress', onKeypress);

  try {
    return await run({ signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new GoBack();
    throw error;
  } finally {
    process.stdin.off('keypress', onKeypress);
  }
};

// Same name and signature as the inquirer prompt (generics are preserved).
const withEscape = <
  F extends (config: any, context?: any) => Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any
>(
  prompt: F
): F =>
  ((config: unknown) =>
    escapable((context) => prompt(config, context))) as unknown as F;

export const select = withEscape(rawSelect);
export const input = withEscape(rawInput);
export const number = withEscape(rawNumber);
export const search = withEscape(rawSearch);
export const confirm = withEscape(rawConfirm);

/** A menu `select`: Esc is the same as choosing the "back" entry. */
export const menu = async (
  config: Parameters<typeof rawSelect<string>>[0]
): Promise<string> => {
  try {
    return await select<string>(config);
  } catch (error) {
    if (error instanceof GoBack) return 'back';
    throw error;
  }
};

/**
 * Runs one action (a form, a picker...) from inside a menu. Esc cancels it and
 * returns to the menu, nothing saved.
 */
export const attempt = async (
  action: () => Promise<void>,
  options: { silent?: boolean } = {}
): Promise<void> => {
  try {
    await action();
  } catch (error) {
    if (error instanceof GoBack) {
      if (!options.silent) console.log('\nCancelled.\n');
      return;
    }

    throw error;
  }
};

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
  try {
    await input({ message: 'Press Enter to continue (Esc to skip)' });
  } catch (error) {
    if (!(error instanceof GoBack)) throw error;
  }
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
    /** Extra check (e.g. "already exists") run last, on the transformed value. Return true or an error message. */
    validate?: (value: string) => Promise<true | string> | true | string;
  } = {}
): Promise<string | null> => {
  const value = await input({
    message: options.required ? message : `${message} (optional)`,
    default: options.default ?? undefined,
    validate: async (raw) => {
      const text = raw.trim();

      if (!text) {
        return options.required ? 'This field is required.' : true;
      }

      if (options.maxLength && text.length > options.maxLength) {
        return `Maximum ${options.maxLength} characters.`;
      }

      const transformed = options.transform ? options.transform(text) : text;

      if (options.pattern && !options.pattern.test(transformed)) {
        return options.patternHint ?? 'Invalid format.';
      }

      return options.validate ? options.validate(transformed) : true;
    }
  });

  const text = value.trim();

  if (!text) {
    return null;
  }

  return options.transform ? options.transform(text) : text;
};

/**
 * Optional decimal number. `step: 'any'` is essential: inquirer's number prompt
 * defaults to `step: 1`, which rejects every decimal (e.g. 16.88009) and also
 * ignores decimal defaults. `decimals` rounds to what the DB column can store.
 */
export const askNumber = async (
  message: string,
  options: {
    min: number;
    max: number;
    default?: number | null;
    decimals?: number;
  }
): Promise<number | null> => {
  const value = await number({
    message: `${message} (optional, ${options.min} to ${options.max})`,
    default: options.default ?? undefined,
    required: false,
    min: options.min,
    max: options.max,
    step: 'any'
  });

  if (value === undefined) {
    return null;
  }

  return options.decimals === undefined
    ? value
    : Number(value.toFixed(options.decimals));
};

/** Latitude and longitude must be given together, or both left empty. */
export const askCoordinates = async (
  defaults: { latitude?: number | null; longitude?: number | null } = {}
): Promise<{ latitude: number | null; longitude: number | null }> => {
  let latitudeDefault = defaults.latitude ?? null;
  let longitudeDefault = defaults.longitude ?? null;

  for (;;) {
    const latitude = await askNumber('Latitude', {
      min: -90,
      max: 90,
      decimals: 7,
      default: latitudeDefault
    });
    const longitude = await askNumber('Longitude', {
      min: -180,
      max: 180,
      decimals: 7,
      default: longitudeDefault
    });

    if ((latitude === null) === (longitude === null)) {
      return { latitude, longitude };
    }

    console.log('Latitude and longitude must be given together. Please enter both, or leave both empty.');

    // Keep what was typed so it does not have to be retyped.
    latitudeDefault = latitude ?? latitudeDefault;
    longitudeDefault = longitude ?? longitudeDefault;
  }
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
