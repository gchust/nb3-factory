// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseManager } from '@nocobase/db';

import { RentalService } from '../../server/providers/rental-service.js';
import {
  createRentalTestDatabase,
  createUser,
} from '../fixtures/rental-database.js';

const manager = { userId: 'manager-1', role: 'manager' } as const;
const staff = { userId: 'staff-1', role: 'staff' } as const;
const other = { userId: 'staff-2', role: 'staff' } as const;

describe('rental attachments', () => {
  let database: DatabaseManager;
  let service: RentalService;
  let venueId: number;
  let tenantId: number;
  let bookingId: number;

  beforeEach(async () => {
    database = await createRentalTestDatabase();
    service = new RentalService(database);
    await createUser(database, manager.userId, 'manager1');
    await createUser(database, staff.userId, 'staff1');
    await createUser(database, other.userId, 'staff2');

    venueId = Number(
      (
        await database
          .query()
          .insertInto('rentalVenues')
          .values({
            name: '附件测试厅',
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
            name: '附件测试租户',
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
        title: '附件测试预订',
        startAt: '2026-12-01T09:00',
        endAt: '2026-12-01T10:00',
        fee: 300,
      })
    ).id;
  });

  afterEach(async () => {
    await database.destroy();
  });

  async function addFile(
    id: string,
    size = 1024,
    ext = 'png',
  ): Promise<string> {
    await database
      .query()
      .insertInto('rentalFiles')
      .values({
        id,
        disk: 'local',
        key: `objects/${id}.${ext}`,
        filename: `file-${id}.${ext}`,
        ext,
        mimeType: ext === 'pdf' ? 'application/pdf' : 'image/png',
        size,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    return id;
  }

  it('links files to the owning booking and keeps kinds separate', async () => {
    const agreement = await addFile('11111111-1111-1111-1111-111111111111');
    const photo = await addFile('22222222-2222-2222-2222-222222222222');

    await service.addBookingAttachments(staff, bookingId, 'agreement', [
      agreement,
    ]);
    const listed = await service.addBookingAttachments(
      staff,
      bookingId,
      'deliveryPhoto',
      [photo],
    );

    expect(listed.map((item) => item.kind).sort()).toEqual([
      'agreement',
      'deliveryPhoto',
    ]);
    expect(listed[0].filename).toBe(`file-${agreement}.png`);
    expect(listed[0].size).toBe(1024);
  });

  it('hides another owner booking attachments from staff', async () => {
    await addFile('33333333-3333-3333-3333-333333333333');
    await expect(
      service.listBookingAttachments(other, bookingId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const asManager = await service.listBookingAttachments(manager, bookingId);
    expect(asManager).toEqual([]);
  });

  it('rejects a selection above the file limit', async () => {
    const ids = await Promise.all(
      Array.from({ length: 6 }, (_value, index) =>
        addFile(`4444444${index}-4444-4444-4444-444444444444`),
      ),
    );
    await expect(
      service.addBookingAttachments(staff, bookingId, 'supplement', ids),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects unknown, oversized and empty files', async () => {
    await expect(
      service.addBookingAttachments(staff, bookingId, 'agreement', [
        '99999999-9999-9999-9999-999999999999',
      ]),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const oversized = await addFile(
      '55555555-5555-5555-5555-555555555555',
      5 * 1024 * 1024 + 1,
    );
    await expect(
      service.addBookingAttachments(staff, bookingId, 'agreement', [oversized]),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const empty = await addFile('66666666-6666-6666-6666-666666666666', 0);
    await expect(
      service.addBookingAttachments(staff, bookingId, 'agreement', [empty]),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('is idempotent when the same file is linked twice', async () => {
    const file = await addFile('77777777-7777-7777-7777-777777777777');
    await service.addBookingAttachments(staff, bookingId, 'agreement', [file]);
    const listed = await service.addBookingAttachments(
      staff,
      bookingId,
      'agreement',
      [file],
    );
    expect(listed).toHaveLength(1);
  });

  it('keeps a settled rental read-only for owner and manager', async () => {
    await service.confirmBooking(manager, bookingId);
    await service.deliverBooking(manager, bookingId, { condition: 'ok' });
    await service.returnBooking(manager, bookingId, { condition: 'ok' });
    await service.settleBooking(manager, bookingId);

    const file = await addFile('88888888-8888-8888-8888-888888888888');
    await expect(
      service.addBookingAttachments(staff, bookingId, 'agreement', [file]),
    ).rejects.toMatchObject({ code: 'READ_ONLY' });
    await expect(
      service.addBookingAttachments(manager, bookingId, 'agreement', [file]),
    ).rejects.toMatchObject({ code: 'READ_ONLY' });
  });

  it('replaces the venue cover and removes the previous file', async () => {
    const first = await addFile('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    const second = await addFile('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

    await service.addVenueAttachments(manager, venueId, 'cover', [first]);
    const listed = await service.addVenueAttachments(
      manager,
      venueId,
      'cover',
      [second],
    );

    expect(listed).toHaveLength(1);
    expect(listed[0].fileId).toBe(second);
    const old = await database
      .query()
      .selectFrom('rentalFiles')
      .select('id')
      .where('id', '=', first)
      .executeTakeFirst();
    expect(old).toBeUndefined();
  });

  it('lets staff read but not modify venue media', async () => {
    const cover = await addFile('cccccccc-cccc-cccc-cccc-cccccccccccc');
    await service.addVenueAttachments(manager, venueId, 'cover', [cover]);

    const visible = await service.listVenueAttachments(staff, venueId);
    expect(visible).toHaveLength(1);
    expect(visible[0].kind).toBe('cover');

    await expect(
      service.addVenueAttachments(staff, venueId, 'gallery', [cover]),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('scopes file content access to the business owner', async () => {
    const bookingFile = await addFile('dddddddd-dddd-dddd-dddd-dddddddddddd');
    const venueFile = await addFile('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
    const orphan = await addFile('ffffffff-ffff-ffff-ffff-ffffffffffff');

    await service.addBookingAttachments(staff, bookingId, 'agreement', [
      bookingFile,
    ]);
    await service.addVenueAttachments(manager, venueId, 'gallery', [venueFile]);

    await expect(service.canReadFile(staff, bookingFile)).resolves.toBe(true);
    await expect(service.canReadFile(manager, bookingFile)).resolves.toBe(true);
    await expect(service.canReadFile(other, bookingFile)).resolves.toBe(false);
    await expect(service.canReadFile(staff, venueFile)).resolves.toBe(true);
    await expect(service.canReadFile(staff, orphan)).resolves.toBe(false);
  });

  it('summarises venue media for the venue list', async () => {
    const cover = await addFile('12121212-1212-1212-1212-121212121212');
    const gallery = await addFile('13131313-1313-1313-1313-131313131313');
    await service.addVenueAttachments(manager, venueId, 'cover', [cover]);
    await service.addVenueAttachments(manager, venueId, 'gallery', [gallery]);

    const media = await service.listVenueMedia();
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({ venueId, gallery: 1 });
    expect(media[0].cover?.fileId).toBe(cover);
  });
});
