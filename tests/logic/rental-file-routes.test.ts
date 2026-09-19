// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  ServerFileRepositoryManager,
  serverFileRepositoryManagerToken,
} from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { createDriveManager, type NocoBaseDriveManager } from '@nocobase/drive';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';

import {
  rentalFileContentRoutes,
  rentalFileUploadRoutes,
} from '../../server/routes/rental-files.js';
import { rentalsRoutes } from '../../server/routes/rentals.js';
import {
  RentalService,
  rentalServiceToken,
} from '../../server/providers/rental-service.js';
import {
  createRentalTestDatabase,
  createUser,
} from '../fixtures/rental-database.js';

const managerUser = 'manager-1';
const staffUser = 'staff-1';
const otherUser = 'staff-2';

const PNG_BYTES = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
]);

function testAuth() {
  return {
    required() {
      return async (context: Context<AuthEnv>, next: Next) => {
        const userId = context.req.header('x-test-user');
        if (!userId) {
          return context.json(
            { code: 'UNAUTHORIZED', message: 'Authentication required' },
            401,
          );
        }
        context.set('auth', {
          user: { id: userId },
          session: { id: 'session' },
        } as never);
        await next();
      };
    },
    optional() {
      return async (_context: Context<AuthEnv>, next: Next) => {
        await next();
      };
    },
  };
}

function testAuthorization() {
  return {
    permissionSets: {
      getEffective: ({ principal }: { principal: { id: string } }) =>
        Promise.resolve([
          {
            key: principal.id.startsWith('manager')
              ? 'system-administrator'
              : 'rental-member',
          },
        ]),
    },
  };
}

describe('rental file routes', () => {
  let database: DatabaseManager;
  let drive: NocoBaseDriveManager;
  let storageDir: string;
  let app: Hono;
  let service: RentalService;
  let venueId: number;
  let tenantId: number;
  let bookingId: number;

  beforeEach(async () => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rental-files-'));
    database = await createRentalTestDatabase();
    drive = createDriveManager({
      default: 'local',
      disks: {
        local: { driver: 'fs', location: storageDir, visibility: 'private' },
      },
    });

    service = new RentalService(database);
    await createUser(database, managerUser, 'manager1');
    await createUser(database, staffUser, 'staff1');
    await createUser(database, otherUser, 'staff2');

    venueId = Number(
      (
        await database
          .query()
          .insertInto('rentalVenues')
          .values({
            name: '文件路由厅',
            location: 'A 座',
            capacity: 10,
            unitPrice: 300,
            status: 'available',
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .execute()
      ).insertId,
    );
    tenantId = Number(
      (
        await database
          .query()
          .insertInto('rentalTenants')
          .values({
            name: '文件路由租户',
            contactName: '联系人',
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .execute()
      ).insertId,
    );
    bookingId = (
      await service.createBooking(
        { userId: staffUser, role: 'staff' },
        {
          venueId,
          tenantId,
          title: '文件路由预订',
          startAt: '2026-12-05T09:00',
          endAt: '2026-12-05T10:00',
          fee: 300,
        },
      )
    ).id;

    const container = new ServiceContainer();
    container.instance(authenticationToken, testAuth() as never);
    container.instance(authorizationToken, testAuthorization() as never);
    container.instance(rentalServiceToken, service);
    container.instance(
      serverFileRepositoryManagerToken,
      new ServerFileRepositoryManager(database, drive),
    );
    container.instance(driveManagerToken, drive);
    container.instance(databaseManagerToken, database);
    const application = {
      container,
      publicBasePath: '',
    } as unknown as Application;

    app = new Hono();
    app.route('/', await rentalsRoutes.createRouter(application));
    app.route('/', await rentalFileUploadRoutes.createRouter(application));
    app.route('/', await rentalFileContentRoutes.createRouter(application));
  });

  afterEach(async () => {
    await database.destroy();
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  function as(userId: string) {
    return { headers: { 'x-test-user': userId } };
  }

  async function upload(
    userId: string | undefined,
    filename: string,
    bytes: Uint8Array = PNG_BYTES,
    type = 'image/png',
  ): Promise<Response> {
    const form = new FormData();
    form.append('file', new File([bytes], filename, { type }));
    return app.request('/rentalFiles:uploadOne', {
      method: 'POST',
      ...(userId ? as(userId) : {}),
      body: form,
    });
  }

  async function link(
    userId: string,
    kind: string,
    fileIds: readonly string[],
    booking = bookingId,
  ): Promise<Response> {
    return app.request(`/rentals/bookings/${booking}/attachments`, {
      method: 'POST',
      headers: { 'x-test-user': userId, 'content-type': 'application/json' },
      body: JSON.stringify({ kind, fileIds }),
    });
  }

  it('rejects an anonymous upload with 401', async () => {
    const response = await upload(undefined, 'photo.png');
    expect(response.status).toBe(401);
  });

  it('rejects an anonymous attachment list with 401', async () => {
    const response = await app.request(
      `/rentals/bookings/${bookingId}/attachments`,
    );
    expect(response.status).toBe(401);
  });

  it('uploads, links and serves identical bytes to an authorized reader', async () => {
    const uploaded = await upload(staffUser, 'site-photo.png');
    expect(uploaded.status).toBe(200);
    const record = (
      (await uploaded.json()) as {
        data: { record: { id: string; ext: string; contentUrl: string } };
      }
    ).data.record;
    expect(record.ext).toBe('png');
    expect(record.contentUrl).toBe(`/uploads/rental-files/${record.id}.png`);

    const linked = await link(staffUser, 'deliveryPhoto', [record.id]);
    expect(linked.status).toBe(201);

    const url = `/uploads/rental-files/${record.id}.png`;
    expect((await app.request(url)).status).toBe(401);
    expect((await app.request(url, as(otherUser))).status).toBe(403);

    const ownerResponse = await app.request(url, as(staffUser));
    expect(ownerResponse.status).toBe(200);
    expect(
      Buffer.from(await ownerResponse.arrayBuffer()).equals(
        Buffer.from(PNG_BYTES),
      ),
    ).toBe(true);

    const managerResponse = await app.request(url, as(managerUser));
    expect(managerResponse.status).toBe(200);
    expect(
      Buffer.from(await managerResponse.arrayBuffer()).equals(
        Buffer.from(PNG_BYTES),
      ),
    ).toBe(true);
  });

  it('refuses content for a file that is not linked to a business record', async () => {
    const uploaded = await upload(staffUser, 'orphan.png');
    const record = (
      (await uploaded.json()) as { data: { record: { id: string } } }
    ).data.record;
    const response = await app.request(
      `/uploads/rental-files/${record.id}.png`,
      as(staffUser),
    );
    expect(response.status).toBe(403);
  });

  it('returns 404 for an unknown file or a mismatched extension', async () => {
    const uploaded = await upload(staffUser, 'known.png');
    const record = (
      (await uploaded.json()) as { data: { record: { id: string } } }
    ).data.record;
    await link(staffUser, 'agreement', [record.id]);

    expect(
      (
        await app.request(
          '/uploads/rental-files/00000000-0000-0000-0000-000000000000.png',
          as(staffUser),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await app.request(
          `/uploads/rental-files/${record.id}.pdf`,
          as(staffUser),
        )
      ).status,
    ).toBe(404);
  });

  it('scopes attachments and content to the owning booking', async () => {
    const otherBooking = await service.createBooking(
      { userId: otherUser, role: 'staff' },
      {
        venueId,
        tenantId,
        title: '他人预订',
        startAt: '2026-12-06T09:00',
        endAt: '2026-12-06T10:00',
        fee: 300,
      },
    );
    const uploaded = await upload(otherUser, 'other.png');
    const record = (
      (await uploaded.json()) as { data: { record: { id: string } } }
    ).data.record;
    await link(otherUser, 'agreement', [record.id], otherBooking.id);

    const staffList = await app.request(
      `/rentals/bookings/${bookingId}/attachments`,
      as(otherUser),
    );
    expect(staffList.status).toBe(404);

    expect(
      (
        await app.request(
          `/uploads/rental-files/${record.id}.png`,
          as(staffUser),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request(
          `/uploads/rental-files/${record.id}.png`,
          as(otherUser),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(
          `/uploads/rental-files/${record.id}.png`,
          as(managerUser),
        )
      ).status,
    ).toBe(200);
  });

  it('lists, removes and re-lists attachments through the business route', async () => {
    const uploaded = await upload(
      staffUser,
      'agreement.pdf',
      new Uint8Array([37, 80, 68, 70]),
      'application/pdf',
    );
    const record = (
      (await uploaded.json()) as { data: { record: { id: string } } }
    ).data.record;
    const created = await link(staffUser, 'agreement', [record.id]);
    const createdBody = (await created.json()) as {
      data: { id: number; contentUrl: string }[];
    };
    expect(createdBody.data).toHaveLength(1);
    const attachmentId = createdBody.data[0].id;

    const removed = await app.request(
      `/rentals/bookings/${bookingId}/attachments/${attachmentId}`,
      { method: 'DELETE', ...as(staffUser) },
    );
    expect(removed.status).toBe(200);
    const removedBody = (await removed.json()) as { data: unknown[] };
    expect(removedBody.data).toEqual([]);

    // The metadata is gone, so the content route no longer resolves it.
    expect(
      (
        await app.request(
          `/uploads/rental-files/${record.id}.pdf`,
          as(staffUser),
        )
      ).status,
    ).toBe(404);
  });

  it('keeps venue media manager-writable and staff-readable', async () => {
    const uploaded = await upload(managerUser, 'cover.png');
    const record = (
      (await uploaded.json()) as { data: { record: { id: string } } }
    ).data.record;

    const forbidden = await app.request(
      `/rentals/venues/${venueId}/attachments`,
      {
        method: 'POST',
        headers: {
          'x-test-user': staffUser,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ kind: 'cover', fileIds: [record.id] }),
      },
    );
    expect(forbidden.status).toBe(403);

    const created = await app.request(
      `/rentals/venues/${venueId}/attachments`,
      {
        method: 'POST',
        headers: {
          'x-test-user': managerUser,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ kind: 'cover', fileIds: [record.id] }),
      },
    );
    expect(created.status).toBe(201);

    const staffList = await app.request(
      `/rentals/venues/${venueId}/attachments`,
      as(staffUser),
    );
    expect(staffList.status).toBe(200);
    const body = (await staffList.json()) as {
      data: { contentUrl: string }[];
    };
    expect(body.data).toHaveLength(1);

    const media = await app.request('/rentals/venue-media', as(staffUser));
    expect(media.status).toBe(200);
    const mediaBody = (await media.json()) as {
      data: { venueId: number; gallery: number; cover: unknown }[];
    };
    expect(mediaBody.data[0]).toMatchObject({ venueId, gallery: 0 });
  });
});
