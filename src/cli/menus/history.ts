import { Knex } from 'knex';
import { printTable } from '../ui';

const formatDate = (value: unknown): string | null =>
  value instanceof Date ? value.toISOString().replace('T', ' ').slice(0, 19) : (value as string | null);

const errorOf = (metadata: unknown): string | null => {
  try {
    const parsed = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;

    if (parsed && typeof parsed === 'object') {
      const record = parsed as { error?: string; cancelled?: boolean };
      if (record.error) return record.error.slice(0, 60);
      if (record.cancelled) return 'cancelled';
    }
  } catch {
    // ignore unparsable metadata
  }

  return null;
};

export const historyMenu = async (db: Knex): Promise<void> => {
  const imports = await db('dataset_imports').orderBy('id', 'desc').limit(20);

  console.log('\nRecent imports');
  printTable(
    imports.map((row) => ({
      id: row.id,
      dataset: row.dataset,
      version: row.dataset_version,
      status: row.status,
      records: row.records_imported,
      started: formatDate(row.started_at),
      completed: formatDate(row.completed_at),
      note: errorOf(row.metadata)
    })),
    'No imports have been run yet.'
  );

  const latest = await db('dataset_imports')
    .where({ status: 'completed' })
    .select('dataset')
    .max({ version_id: 'id' })
    .groupBy('dataset');

  console.log('Latest completed version per dataset');
  const versions: Record<string, unknown>[] = [];

  for (const row of latest as { dataset: string; version_id: number }[]) {
    const detail = await db('dataset_imports').where({ id: row.version_id }).first();

    versions.push({
      dataset: row.dataset,
      version: detail.dataset_version,
      completed: formatDate(detail.completed_at)
    });
  }

  printTable(versions, 'No completed imports.');

  const count = async (table: string, source?: string): Promise<number> => {
    const query = db(table).count({ total: '*' });
    if (source) query.where({ source });
    const [row] = await query;
    return Number(row.total);
  };

  const tables = ['countries', 'languages', 'glottolog_languoids', 'languoid_countries'];
  const counts: Record<string, unknown>[] = [];

  for (const table of tables) {
    counts.push({
      table,
      total: await count(table),
      manual: await count(table, 'manual')
    });
  }

  const [mappings] = await db('country_languages').count({ total: '*' });
  const [manualMappings] = await db('country_languages')
    .where({ source: 'manual' })
    .count({ total: '*' });

  counts.push({
    table: 'country_languages',
    total: Number(mappings.total),
    manual: Number(manualMappings.total)
  });

  console.log('Row counts');
  printTable(counts);

  const levels = await db('glottolog_languoids')
    .select('level')
    .count({ total: '*' })
    .groupBy('level')
    .orderBy('level');

  console.log('Glottolog languoids by level');
  printTable(
    (levels as { level: string; total: number | string }[]).map((row) => ({
      level: row.level,
      total: Number(row.total)
    }))
  );
};
