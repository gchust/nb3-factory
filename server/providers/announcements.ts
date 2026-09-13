import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface Announcement {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface CreateAnnouncementInput {
  readonly title: string;
  readonly body: string;
}

export interface AnnouncementService {
  /** Every announcement, newest first. */
  list(): Promise<readonly Announcement[]>;
  create(input: CreateAnnouncementInput): Promise<Announcement>;
}

export const announcementServiceToken: ServiceToken<AnnouncementService> =
  createServiceToken<AnnouncementService>('app/announcement-service');

export function createAnnouncementService(
  database: Pick<DatabaseManager, 'query'>,
): AnnouncementService {
  return {
    async list() {
      const rows = await database
        .query()
        .selectFrom('announcements')
        .select(['id', 'title', 'body', 'createdAt'])
        // `id` breaks ties so two announcements created in the same millisecond still have a stable order.
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .execute();
      return rows.map(toAnnouncement);
    },

    async create(input: CreateAnnouncementInput) {
      const result = await database
        .query()
        .insertInto('announcements')
        .values({ title: input.title, body: input.body, createdAt: new Date() })
        .execute();
      const id = result.insertId;
      if (id === undefined || id === null) {
        throw new Error('The announcements table did not return an id.');
      }

      const row = await database
        .query()
        .selectFrom('announcements')
        .select(['id', 'title', 'body', 'createdAt'])
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) {
        throw new Error('The created announcement was not found.');
      }
      return toAnnouncement(row);
    },
  };
}

function toAnnouncement(row: Record<string, unknown>): Announcement {
  return {
    id: Number(row.id),
    title: String(row.title),
    body: String(row.body),
    createdAt: toIsoString(row.createdAt),
  };
}

/**
 * Datetime columns come back from the query adapter in a driver-specific shape: a `Date`, an epoch number, or the
 * epoch as a numeric string (SQLite stores it that way). Normalize all of them to ISO 8601 so the API is uniform.
 */
function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string') {
    const text = value.trim();
    const parsed = /^-?\d+(\.\d+)?$/.test(text)
      ? new Date(Number(text))
      : new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  throw new Error('An announcement has an unreadable creation time.');
}

export default class AnnouncementProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/announcement-provider';

  public override register(): void {
    this.app.container.singleton(announcementServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createAnnouncementService(database);
    });
  }
}
