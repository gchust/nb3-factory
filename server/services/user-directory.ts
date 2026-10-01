import type { DatabaseConnection } from '@nocobase/db';

// Display names for the accounts a business record references. Reading them is derived data: the caller already holds
// authorized rows and only needs a label for an id it can see. It deliberately exposes nothing but id and name.
export interface UserLabelRow {
  id: string;
  name: string | null;
  username: string | null;
}

export interface UserDirectory {
  names(
    ids: readonly (string | null | undefined)[],
  ): Promise<Map<string, string>>;
  list(): Promise<readonly { id: string; name: string; username: string }[]>;
}

export function createUserDirectory(database: {
  connection(name?: string): DatabaseConnection;
}): UserDirectory {
  async function readUsers(
    ids?: readonly string[],
  ): Promise<readonly UserLabelRow[]> {
    const repository = database.connection().repository<UserLabelRow>('user');
    if (ids && ids.length > 0) {
      return repository.findMany({
        filter: (filter) =>
          filter.or(ids.map((id) => filter.string('id').eq(id))),
        limit: ids.length,
      });
    }
    return repository.findMany({ sort: (sort) => sort.field('name').asc() });
  }

  function label(row: UserLabelRow): string {
    return row.name?.trim() || row.username?.trim() || row.id;
  }

  return {
    async names(ids) {
      const distinct = Array.from(
        new Set(
          ids.filter(
            (id): id is string => typeof id === 'string' && id.length > 0,
          ),
        ),
      );
      const result = new Map<string, string>();
      if (distinct.length === 0) return result;
      for (const row of await readUsers(distinct)) {
        result.set(row.id, label(row));
      }
      return result;
    },
    async list() {
      const rows = await readUsers();
      return rows.map((row) => ({
        id: row.id,
        name: label(row),
        username: row.username ?? '',
      }));
    },
  };
}
