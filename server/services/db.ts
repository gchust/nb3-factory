import type { QueryAdapter, Row, SelectQuery } from '@nocobase/db';

export type Match = Readonly<Record<string, unknown>>;

/**
 * The application's query adapter is a portable builder, not Kysely: writes
 * return counts rather than rows, so a write that has to hand the stored record
 * back re-reads it through the same connection. These helpers keep that pattern
 * in one place.
 */
function applyMatch<T extends Row>(
  query: SelectQuery<T, Row>,
  match: Match,
): SelectQuery<T, Row> {
  let scoped = query;
  for (const [key, value] of Object.entries(match)) {
    scoped = scoped.where(key, '=', value as never);
  }
  return scoped;
}

export async function selectOne<T extends Row>(
  query: QueryAdapter,
  table: string,
  match: Match,
): Promise<T> {
  const row = await applyMatch(
    query.selectFrom<T>(table).selectAll(),
    match,
  ).executeTakeFirst<T>();
  if (!row) throw new Error(`Record not found in ${table}`);
  return row;
}

export async function insertReturning<T extends Row>(
  query: QueryAdapter,
  table: string,
  values: Record<string, unknown>,
  match: Match,
): Promise<T> {
  await query.insertInto(table).values(values).execute();
  return selectOne<T>(query, table, match);
}

export async function updateReturning<T extends Row>(
  query: QueryAdapter,
  table: string,
  values: Record<string, unknown>,
  match: Match,
): Promise<T> {
  let scoped = query.updateTable(table).set(values);
  for (const [key, value] of Object.entries(match)) {
    scoped = scoped.where(key, '=', value as never);
  }
  await scoped.execute();
  return selectOne<T>(query, table, match);
}

/**
 * A unique-constraint violation is a business conflict, not a server fault. The
 * portable query adapter surfaces the driver error, whose code and message
 * differ between SQLite and PostgreSQL; match both shapes here so callers can
 * answer with a clear 409 instead of a generic 500.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  if (typeof code === 'string') {
    if (code === '23505' || code === 'SQLITE_CONSTRAINT_UNIQUE') return true;
    if (code === 'ER_DUP_ENTRY') return true;
  }
  return (
    typeof message === 'string' &&
    /unique constraint|duplicate key/i.test(message)
  );
}
