import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** The counter row the homepage increments; the browser never chooses it. */
export const HOME_COUNTER_KEY = 'home';

export interface AccessCounterService {
  read(key: string): Promise<number>;
  increment(key: string): Promise<number>;
}

export const accessCounterServiceToken: ServiceToken<AccessCounterService> =
  createServiceToken<AccessCounterService>('app/access-counter-service');

/**
 * Reads and atomically increments a named counter row.
 *
 * The value lives in the database rather than in process memory, so it keeps growing across browsers, sessions and
 * server restarts. The row is created on first increment when a seed has not run, which keeps the write path working
 * on a freshly migrated database.
 */
export function createAccessCounterService(
  database: DatabaseManager,
): AccessCounterService {
  return {
    async read(key) {
      const row = await database
        .query()
        .selectFrom('accessCounters')
        .select('count')
        .where('key', '=', key)
        .executeTakeFirst<{ count: number }>();
      return row ? Number(row.count) : 0;
    },

    async increment(key) {
      return database.transaction(async (connection) => {
        const row = await connection.query
          .selectFrom('accessCounters')
          .select('count')
          .where('key', '=', key)
          .executeTakeFirst<{ count: number }>();
        const next = (row ? Number(row.count) : 0) + 1;

        if (row) {
          await connection.query
            .updateTable('accessCounters')
            .set({ count: next, updatedAt: new Date() })
            .where('key', '=', key)
            .execute();
        } else {
          await connection.query
            .insertInto('accessCounters')
            .values({ key, count: next, updatedAt: new Date() })
            .execute();
        }

        return next;
      });
    },
  };
}

export default class AccessCounterProvider extends ServiceProvider<Application> {
  public readonly name = 'app/access-counter-provider';

  public override register(): void {
    this.app.container.singleton(accessCounterServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createAccessCounterService(database);
    });
  }
}
