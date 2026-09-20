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

describe('RentalService', () => {
  let database: DatabaseManager;
  let service: RentalService;
  let venueId: number;
  let tenantId: number;

  beforeEach(async () => {
    database = await createRentalTestDatabase();
    service = new RentalService(database);
    venueId = Number(
      (
        await database
          .query()
          .insertInto('rentalVenues')
          .values({
            name: '测试厅',
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
            name: '测试租户',
            contactName: '联系人',
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .execute()
      ).insertId,
    );
  });

  afterEach(async () => {
    await database.destroy();
  });

  function input(startAt: string, endAt: string, ownerId?: string) {
    return {
      venueId,
      tenantId,
      title: '测试预订',
      startAt,
      endAt,
      fee: 600,
      ...(ownerId ? { ownerId } : {}),
    };
  }

  it('rejects a booking that overlaps a reserved slot', async () => {
    await service.createBooking(
      staff,
      input('2026-10-01T09:00', '2026-10-01T11:00'),
    );

    await expect(
      service.createBooking(
        staff,
        input('2026-10-01T10:00', '2026-10-01T12:00'),
      ),
    ).rejects.toMatchObject({ code: 'TIME_CONFLICT', status: 409 });
  });

  it('rejects a booking that overlaps a slot crossing midnight', async () => {
    await service.createBooking(
      staff,
      input('2026-10-01T22:00', '2026-10-02T02:00'),
    );

    // Starts before midnight but ends after the existing booking begins.
    await expect(
      service.createBooking(
        staff,
        input('2026-10-01T23:00', '2026-10-02T01:00'),
      ),
    ).rejects.toMatchObject({ code: 'TIME_CONFLICT', status: 409 });
    // Begins on the next day while the previous booking is still running.
    await expect(
      service.createBooking(
        staff,
        input('2026-10-02T01:00', '2026-10-02T03:00'),
      ),
    ).rejects.toMatchObject({ code: 'TIME_CONFLICT', status: 409 });
  });

  it('accepts bookings that touch but do not overlap, including across midnight', async () => {
    await service.createBooking(
      staff,
      input('2026-10-01T22:00', '2026-10-02T02:00'),
    );

    // Ends exactly when the existing booking starts.
    const before = await service.createBooking(
      staff,
      input('2026-10-01T20:00', '2026-10-01T22:00'),
    );
    expect(before.status).toBe('pending');
    // Starts exactly when the existing booking ends, on the next day.
    const after = await service.createBooking(
      staff,
      input('2026-10-02T02:00', '2026-10-02T04:00'),
    );
    expect(after.status).toBe('pending');
  });

  it('releases the slot after cancellation', async () => {
    const first = await service.createBooking(
      staff,
      input('2026-10-01T09:00', '2026-10-01T11:00'),
    );
    await service.cancelBooking(staff, first.id, { reason: '客户取消' });

    const second = await service.createBooking(
      staff,
      input('2026-10-01T10:00', '2026-10-01T12:00'),
    );
    expect(second.status).toBe('pending');
  });

  it('frees the whole window of a cancelled cross-day booking for a new one', async () => {
    const first = await service.createBooking(
      staff,
      input('2026-10-20T22:00', '2026-10-21T02:00'),
    );
    await expect(
      service.createBooking(
        staff,
        input('2026-10-21T00:00', '2026-10-21T01:00'),
      ),
    ).rejects.toMatchObject({ code: 'TIME_CONFLICT' });

    await service.cancelBooking(staff, first.id, { reason: '档期调整' });

    const replacement = await service.createBooking(
      staff,
      input('2026-10-21T00:00', '2026-10-21T01:00'),
    );
    expect(replacement.status).toBe('pending');
  });

  it('rejects an invalid time range and an unavailable venue', async () => {
    await expect(
      service.createBooking(
        staff,
        input('2026-10-01T12:00', '2026-10-01T11:00'),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 400 });

    await database
      .query()
      .updateTable('rentalVenues')
      .set({ status: 'maintenance' })
      .where('id', '=', venueId)
      .execute();
    await expect(
      service.createBooking(
        staff,
        input('2026-10-01T09:00', '2026-10-01T10:00'),
      ),
    ).rejects.toMatchObject({ code: 'VENUE_UNAVAILABLE', status: 409 });
  });

  it('runs the full lifecycle and records handover data', async () => {
    const created = await service.createBooking(
      staff,
      input('2026-10-10T09:00', '2026-10-10T12:00'),
    );
    expect(created).toMatchObject({ status: 'pending', ownerId: 'staff-1' });

    const confirmed = await service.confirmBooking(manager, created.id);
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.confirmedAt).not.toBeNull();

    const delivered = await service.deliverBooking(staff, created.id, {
      condition: '场地整洁',
    });
    expect(delivered).toMatchObject({
      status: 'delivered',
      deliveryCondition: '场地整洁',
    });

    const returned = await service.returnBooking(staff, created.id, {
      condition: '桌椅归位',
      damageNote: '墙面划痕',
      damageFee: 80,
    });
    expect(returned).toMatchObject({
      status: 'returned',
      returnCondition: '桌椅归位',
      damageNote: '墙面划痕',
      damageFee: 80,
    });

    const settled = await service.settleBooking(manager, created.id);
    expect(settled.status).toBe('settled');
    expect(settled.settledAt).not.toBeNull();
  });

  it('rejects a repeated transition instead of writing twice', async () => {
    const created = await service.createBooking(
      staff,
      input('2026-10-11T09:00', '2026-10-11T10:00'),
    );
    await service.confirmBooking(manager, created.id);

    await expect(
      service.confirmBooking(manager, created.id),
    ).rejects.toMatchObject({ code: 'INVALID_STATUS', status: 409 });
  });

  it('lets only a manager confirm, settle and reassign', async () => {
    await createUser(database, 'staff-2', 'staff-2');
    const created = await service.createBooking(
      staff,
      input('2026-10-12T09:00', '2026-10-12T10:00'),
    );

    await expect(
      service.confirmBooking(staff, created.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    await expect(
      service.reassignOwner(staff, created.id, 'staff-2'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });

    const reassigned = await service.reassignOwner(
      manager,
      created.id,
      'staff-2',
    );
    expect(reassigned.ownerId).toBe('staff-2');

    // The former owner may no longer act on it.
    await service.confirmBooking(manager, created.id);
    await expect(
      service.deliverBooking(staff, created.id, { condition: '整洁' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('scopes reads to the owner for staff and shows everything to a manager', async () => {
    const mine = await service.createBooking(
      staff,
      input('2026-10-13T09:00', '2026-10-13T10:00'),
    );
    await service.createBooking(
      manager,
      input('2026-10-14T09:00', '2026-10-14T10:00'),
    );

    await expect(service.listBookings(staff, {})).resolves.toHaveLength(1);
    await expect(service.getBooking(other, mine.id)).resolves.toBeUndefined();

    const all = await service.listBookings(manager, {});
    expect(all).toHaveLength(2);
  });

  it('summarises counts, revenue and utilization', async () => {
    const first = await service.createBooking(
      staff,
      input('2026-10-15T09:00', '2026-10-15T12:00'),
    );
    await service.confirmBooking(manager, first.id);
    const second = await service.createBooking(
      staff,
      input('2026-10-16T09:00', '2026-10-16T18:00'),
    );
    await service.cancelBooking(staff, second.id, {});

    const summary = await service.summary(
      manager,
      new Date('2026-10-15T00:00:00Z'),
      new Date('2026-10-17T00:00:00Z'),
    );
    expect(summary.totals.bookings).toBe(2);
    expect(summary.totals.byStatus.pending).toBe(0);
    expect(summary.totals.byStatus.confirmed).toBe(1);
    expect(summary.totals.byStatus.cancelled).toBe(1);
    // Cancelled bookings do not count toward revenue.
    expect(summary.totals.revenue).toBe(600);
    expect(summary.venues).toHaveLength(1);
    expect(summary.venues[0]).toMatchObject({
      venueId,
      bookings: 1,
      bookedHours: 3,
      revenue: 600,
    });
    expect(summary.venues[0].utilization).toBeGreaterThan(0);
  });
});
