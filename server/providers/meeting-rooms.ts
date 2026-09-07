import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

// `create-app` rewrites this literal to the generated application's own package name. Keeping it alone on one short
// line means the rewrite cannot change how Prettier wraps the statements that use it: a shorter name would otherwise
// let a wrapped call collapse onto one line, leaving the generated project failing its own `pnpm format:check`.
const APP_PACKAGE_NAME = '@nocobase/app-template-default';

export interface MeetingRoom {
  id: number;
  code: string;
  name: string;
  location: string;
  capacity: number;
  equipment: string | null;
  available: boolean;
  createdAt: Date;
}

export interface MeetingRoomInput {
  code: string;
  name: string;
  location: string;
  capacity: number;
  equipment?: string | null;
  available: boolean;
}

export interface MeetingRoomService {
  list(): Promise<MeetingRoom[]>;
  get(id: number): Promise<MeetingRoom | undefined>;
  create(input: MeetingRoomInput): Promise<MeetingRoom>;
  update(id: number, input: MeetingRoomInput): Promise<MeetingRoom | undefined>;
}

export const meetingRoomServiceToken: ServiceToken<MeetingRoomService> =
  createServiceToken<MeetingRoomService>(
    `${APP_PACKAGE_NAME}/meeting-room-service`,
  );

export class MeetingRoomServiceError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MeetingRoomServiceError';
    this.code = code;
  }
}

export default class MeetingRoomProvider extends ServiceProvider<Application> {
  public readonly name: string = `${APP_PACKAGE_NAME}/meeting-room-provider`;

  public override register(): void {
    const database = this.app.container.resolve(databaseManagerToken);

    // The SQLite driver returns datetime columns as epoch-millisecond numbers
    // (or Date objects in the in-memory test database), so normalize createdAt
    // to a real Date before it leaves the service.
    const toDate = (value: unknown): Date => {
      if (value instanceof Date) return value;
      if (typeof value === 'number') return new Date(value);
      return new Date(String(value));
    };

    const toRoom = (row: Record<string, unknown>): MeetingRoom => ({
      id: Number(row.id),
      code: String(row.code),
      name: String(row.name),
      location: String(row.location),
      capacity: Number(row.capacity),
      equipment: typeof row.equipment === 'string' ? row.equipment : null,
      available: Boolean(row.available),
      createdAt: toDate(row.createdAt),
    });

    const get = async (id: number): Promise<MeetingRoom | undefined> => {
      const row = await database
        .query()
        .selectFrom('meetingRooms')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      return row ? toRoom(row) : undefined;
    };

    this.app.container.instance(meetingRoomServiceToken, {
      async list() {
        const rows = await database
          .query()
          .selectFrom('meetingRooms')
          .selectAll()
          .orderBy('code', 'asc')
          .execute();
        return rows.map((row) => toRoom(row));
      },

      get,

      async create(input) {
        const existing = await database
          .query()
          .selectFrom('meetingRooms')
          .select('id')
          .where('code', '=', input.code)
          .executeTakeFirst();

        if (existing) {
          throw new MeetingRoomServiceError(
            'CODE_TAKEN',
            `A meeting room with code "${input.code}" already exists.`,
          );
        }

        const result = await database
          .query()
          .insertInto('meetingRooms')
          .values({
            code: input.code,
            name: input.name,
            location: input.location,
            capacity: input.capacity,
            equipment: input.equipment ?? null,
            available: input.available,
            createdAt: new Date(),
          })
          .execute();

        const id = Number(result.insertId);
        const created = await get(id);
        if (!created) {
          throw new MeetingRoomServiceError(
            'CREATE_FAILED',
            'The meeting room was not created.',
          );
        }
        return created;
      },

      async update(id, input) {
        const existing = await database
          .query()
          .selectFrom('meetingRooms')
          .select('id')
          .where('code', '=', input.code)
          .where('id', '!=', id)
          .executeTakeFirst();

        if (existing) {
          throw new MeetingRoomServiceError(
            'CODE_TAKEN',
            `A meeting room with code "${input.code}" already exists.`,
          );
        }

        const result = await database
          .query()
          .updateTable('meetingRooms')
          .set({
            code: input.code,
            name: input.name,
            location: input.location,
            capacity: input.capacity,
            equipment: input.equipment ?? null,
            available: input.available,
          })
          .where('id', '=', id)
          .execute();

        if (result.updatedCount === 0) {
          return undefined;
        }

        return get(id);
      },
    } satisfies MeetingRoomService);
  }
}
