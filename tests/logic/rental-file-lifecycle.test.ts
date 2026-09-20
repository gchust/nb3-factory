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
  MAX_FILE_BYTES,
  RENTAL_FILE_ACCESS_PATH,
} from '../../server/providers/rental-files.js';
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

/**
 * The application's own sample files. They are real PNG, multi-page PDF and
 * UTF-8 text bytes with fictional content, and the home page offers them for
 * download so the running application can be exercised with them.
 */
const DEMO_DIR = path.resolve(import.meta.dirname, '../../public/assets/demo');

const SAMPLE_FILES = {
  cover: { name: 'venue-cover.png', type: 'image/png' },
  photo: { name: 'delivery-photo.png', type: 'image/png' },
  agreement: { name: 'rental-agreement.pdf', type: 'application/pdf' },
  acceptance: { name: 'delivery-acceptance.pdf', type: 'application/pdf' },
  supplement: { name: 'rental-supplement.txt', type: 'text/plain' },
} as const;

function sample(name: keyof typeof SAMPLE_FILES): {
  readonly bytes: Uint8Array;
  readonly label: string;
  readonly type: string;
} {
  const spec = SAMPLE_FILES[name];
  return {
    bytes: new Uint8Array(fs.readFileSync(path.join(DEMO_DIR, spec.name))),
    label: spec.name,
    type: spec.type,
  };
}

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

describe('rental file lifecycle with real sample files', () => {
  let database: DatabaseManager;
  let drive: NocoBaseDriveManager;
  let storageDir: string;
  let app: Hono;
  let service: RentalService;
  let venueId: number;
  let tenantId: number;
  let bookingId: number;

  const staff = { userId: staffUser, role: 'staff' } as const;
  const manager = { userId: managerUser, role: 'manager' } as const;

  beforeEach(async () => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rental-lifecycle-'));
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
            name: '实测厅',
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
            name: '实测租户',
            contactName: '联系人',
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .execute()
      ).insertId,
    );
    bookingId = (
      await service.createBooking(staff, {
        venueId,
        tenantId,
        title: '实测预订',
        startAt: '2026-12-10T09:00',
        endAt: '2026-12-10T12:00',
        fee: 900,
      })
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

  async function uploadOne(
    userId: string,
    name: keyof typeof SAMPLE_FILES,
  ): Promise<{ id: string; ext: string; contentUrl: string }> {
    const file = sample(name);
    const form = new FormData();
    form.append(
      'file',
      new File([file.bytes], file.label, { type: file.type }),
    );
    const response = await app.request('/rentalFiles:uploadOne', {
      method: 'POST',
      ...as(userId),
      body: form,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { record: { id: string; ext: string; contentUrl: string } };
    };
    return body.data.record;
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

  async function createBookingFor(
    owner: string,
    startAt: string,
    endAt: string,
  ): Promise<number> {
    return (
      await service.createBooking(
        { userId: owner, role: 'staff' },
        {
          venueId,
          tenantId,
          title: `${owner} 的预订`,
          startAt,
          endAt,
          fee: 300,
        },
      )
    ).id;
  }

  async function bytesOf(
    userId: string,
    fileId: string,
    ext: string,
  ): Promise<Response> {
    return app.request(
      `${RENTAL_FILE_ACCESS_PATH}/${fileId}.${ext}`,
      as(userId),
    );
  }

  it('downloads the real image, multi-page PDF and text file byte for byte', async () => {
    const photo = await uploadOne(staffUser, 'photo');
    const pdf = await uploadOne(staffUser, 'agreement');
    const text = await uploadOne(staffUser, 'supplement');

    expect((await link(staffUser, 'deliveryPhoto', [photo.id])).status).toBe(
      201,
    );
    expect((await link(staffUser, 'deliveryPdf', [pdf.id])).status).toBe(201);
    expect((await link(staffUser, 'supplement', [text.id])).status).toBe(201);

    for (const [record, name] of [
      [photo, 'photo'],
      [pdf, 'agreement'],
      [text, 'supplement'],
    ] as const) {
      const expected = sample(name);
      const response = await bytesOf(staffUser, record.id, record.ext);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(expected.type);
      expect(Number(response.headers.get('content-length'))).toBe(
        expected.bytes.byteLength,
      );
      expect(
        Buffer.from(await response.arrayBuffer()).equals(
          Buffer.from(expected.bytes),
        ),
      ).toBe(true);
    }
  });

  it('links a batch of five files at once and serves each of them', async () => {
    const ids: string[] = [];
    for (const name of [
      'cover',
      'photo',
      'agreement',
      'acceptance',
      'supplement',
    ] as const) {
      ids.push((await uploadOne(staffUser, name)).id);
    }

    const created = await link(staffUser, 'supplement', ids);
    expect(created.status).toBe(201);
    const body = (await created.json()) as { data: { fileId: string }[] };
    expect(body.data).toHaveLength(5);
    expect(new Set(body.data.map((item) => item.fileId))).toEqual(new Set(ids));
  });

  it('rejects an oversized upload instead of saving it', async () => {
    const oversized = new Uint8Array(MAX_FILE_BYTES + 1);
    const form = new FormData();
    form.append(
      'file',
      new File([oversized], 'too-big.txt', { type: 'text/plain' }),
    );
    const uploaded = await app.request('/rentalFiles:uploadOne', {
      method: 'POST',
      ...as(staffUser),
      body: form,
    });
    expect(uploaded.status).toBe(200);
    const record = (
      (await uploaded.json()) as { data: { record: { id: string } } }
    ).data.record;

    const linked = await link(staffUser, 'supplement', [record.id]);
    expect(linked.status).toBe(400);

    const listed = await app.request(
      `/rentals/bookings/${bookingId}/attachments`,
      as(staffUser),
    );
    expect((await listed.json()) as { data: unknown[] }).toMatchObject({
      data: [],
    });
  });

  it('keeps delivery and return photos when a venue cover is replaced', async () => {
    const delivery = await uploadOne(staffUser, 'photo');
    const returned = await uploadOne(staffUser, 'acceptance');
    await link(staffUser, 'deliveryPhoto', [delivery.id]);
    await link(staffUser, 'returnPdf', [returned.id]);

    const firstCover = await uploadOne(managerUser, 'cover');
    const attachCover = (fileId: string) =>
      app.request(`/rentals/venues/${venueId}/attachments`, {
        method: 'POST',
        headers: {
          'x-test-user': managerUser,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ kind: 'cover', fileIds: [fileId] }),
      });
    expect((await attachCover(firstCover.id)).status).toBe(201);

    const secondCover = await uploadOne(managerUser, 'cover');
    expect((await attachCover(secondCover.id)).status).toBe(201);

    // The booking's handover material is untouched.
    const bookingList = await app.request(
      `/rentals/bookings/${bookingId}/attachments`,
      as(staffUser),
    );
    const bookingBody = (await bookingList.json()) as {
      data: { kind: string; fileId: string }[];
    };
    expect(bookingBody.data.map((item) => item.kind).sort()).toEqual([
      'deliveryPhoto',
      'returnPdf',
    ]);
    for (const [record, name] of [
      [delivery, 'photo'],
      [returned, 'acceptance'],
    ] as const) {
      const expected = sample(name);
      const response = await bytesOf(staffUser, record.id, record.ext);
      expect(response.status).toBe(200);
      expect(
        Buffer.from(await response.arrayBuffer()).equals(
          Buffer.from(expected.bytes),
        ),
      ).toBe(true);
    }

    // The replaced cover is gone; the new one is served.
    expect(
      (await bytesOf(managerUser, firstCover.id, firstCover.ext)).status,
    ).toBe(404);
    expect(
      (await bytesOf(managerUser, secondCover.id, secondCover.ext)).status,
    ).toBe(200);
  });

  it('removes one booking file without touching another booking', async () => {
    const otherBooking = await createBookingFor(
      otherUser,
      '2026-12-11T09:00',
      '2026-12-11T10:00',
    );
    const mine = await uploadOne(staffUser, 'agreement');
    const theirs = await uploadOne(otherUser, 'acceptance');
    const created = await link(staffUser, 'agreement', [mine.id]);
    await link(otherUser, 'agreement', [theirs.id], otherBooking);
    const attachmentId = ((await created.json()) as { data: { id: number }[] })
      .data[0].id;

    const removed = await app.request(
      `/rentals/bookings/${bookingId}/attachments/${attachmentId}`,
      { method: 'DELETE', ...as(staffUser) },
    );
    expect(removed.status).toBe(200);

    // Mine is gone, theirs is intact and still readable.
    expect((await bytesOf(staffUser, mine.id, mine.ext)).status).toBe(404);
    const otherList = await app.request(
      `/rentals/bookings/${otherBooking}/attachments`,
      as(otherUser),
    );
    const otherBody = (await otherList.json()) as {
      data: { fileId: string }[];
    };
    expect(otherBody.data.map((item) => item.fileId)).toEqual([theirs.id]);
    const expected = sample('acceptance');
    const response = await bytesOf(otherUser, theirs.id, theirs.ext);
    expect(response.status).toBe(200);
    expect(
      Buffer.from(await response.arrayBuffer()).equals(
        Buffer.from(expected.bytes),
      ),
    ).toBe(true);
  });

  it('freezes handover evidence once the rental is settled', async () => {
    const evidence = await uploadOne(staffUser, 'acceptance');
    const created = await link(staffUser, 'deliveryPdf', [evidence.id]);
    const attachmentId = ((await created.json()) as { data: { id: number }[] })
      .data[0].id;

    await service.confirmBooking(manager, bookingId);
    await service.deliverBooking(manager, bookingId, { condition: '整洁' });
    await service.returnBooking(manager, bookingId, { condition: '完好' });
    await service.settleBooking(manager, bookingId);

    const extra = await uploadOne(staffUser, 'photo');
    expect((await link(staffUser, 'returnPhoto', [extra.id])).status).toBe(409);
    const removed = await app.request(
      `/rentals/bookings/${bookingId}/attachments/${attachmentId}`,
      { method: 'DELETE', ...as(managerUser) },
    );
    expect(removed.status).toBe(409);

    // Reading the frozen evidence still works for someone with access.
    expect((await bytesOf(staffUser, evidence.id, evidence.ext)).status).toBe(
      200,
    );
  });

  it('denies the former owner the old link after a reassignment', async () => {
    const file = await uploadOne(staffUser, 'agreement');
    await link(staffUser, 'agreement', [file.id]);
    expect((await bytesOf(staffUser, file.id, file.ext)).status).toBe(200);

    await service.reassignOwner(manager, bookingId, otherUser);

    expect((await bytesOf(staffUser, file.id, file.ext)).status).toBe(403);
    expect(
      (
        await app.request(
          `/rentals/bookings/${bookingId}/attachments`,
          as(staffUser),
        )
      ).status,
    ).toBe(404);
    expect((await bytesOf(otherUser, file.id, file.ext)).status).toBe(200);
    expect((await bytesOf(managerUser, file.id, file.ext)).status).toBe(200);
  });

  it('never returns another record’s files in an attachment list', async () => {
    const otherBooking = await createBookingFor(
      otherUser,
      '2026-12-12T09:00',
      '2026-12-12T10:00',
    );
    const mine = await uploadOne(staffUser, 'photo');
    const theirs = await uploadOne(otherUser, 'supplement');
    await link(staffUser, 'deliveryPhoto', [mine.id]);
    await link(otherUser, 'supplement', [theirs.id], otherBooking);

    const mineList = await app.request(
      `/rentals/bookings/${bookingId}/attachments`,
      as(staffUser),
    );
    const mineBody = (await mineList.json()) as { data: { fileId: string }[] };
    expect(mineBody.data.map((item) => item.fileId)).toEqual([mine.id]);
    expect(mineBody.data.some((item) => item.fileId === theirs.id)).toBe(false);
  });
});
