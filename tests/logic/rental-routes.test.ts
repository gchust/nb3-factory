// @vitest-environment node
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import type { DatabaseManager } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';

import { rentalsRoutes } from '../../server/routes/rentals.js';
import {
  RentalService,
  rentalServiceToken,
} from '../../server/providers/rental-service.js';
import { createRentalTestDatabase } from '../fixtures/rental-database.js';

const managerUser = 'manager-1';
const staffUser = 'staff-1';

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

describe('rental routes', () => {
  let database: DatabaseManager;
  let service: RentalService;
  let router: Hono;
  let venueId: number;
  let tenantId: number;

  beforeEach(async () => {
    database = await createRentalTestDatabase();
    service = new RentalService(database);

    const venue = await database
      .query()
      .insertInto('rentalVenues')
      .values({
        name: '路由测试厅',
        location: 'A 座',
        capacity: 10,
        unitPrice: 300,
        status: 'available',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    venueId = Number(venue.insertId);
    const tenant = await database
      .query()
      .insertInto('rentalTenants')
      .values({
        name: '路由测试租户',
        contactName: '联系人',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    tenantId = Number(tenant.insertId);

    const container = new ServiceContainer();
    container.instance(authenticationToken, testAuth() as never);
    container.instance(authorizationToken, testAuthorization() as never);
    container.instance(rentalServiceToken, service);
    router = await rentalsRoutes.createRouter({
      container,
    } as unknown as Application);
  });

  afterEach(async () => {
    await database.destroy();
  });

  function as(userId: string) {
    return { headers: { 'x-test-user': userId } };
  }

  async function seedBooking(
    ownerId: string,
    startAt: string,
    endAt: string,
  ): Promise<number> {
    const created = await service.createBooking(
      { userId: ownerId, role: 'staff' },
      {
        venueId,
        tenantId,
        title: '路由预订',
        startAt,
        endAt,
        fee: 300,
      },
    );
    return created.id;
  }

  it('rejects anonymous requests with 401', async () => {
    const response = await router.request('/rentals/bookings');
    expect(response.status).toBe(401);
  });

  it('returns only the caller own bookings to staff', async () => {
    await seedBooking(staffUser, '2026-11-01T09:00', '2026-11-01T10:00');
    await seedBooking(managerUser, '2026-11-02T09:00', '2026-11-02T10:00');

    const response = await router.request('/rentals/bookings', as(staffUser));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { ownerId: string }[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].ownerId).toBe(staffUser);
  });

  it('hides another owner booking behind 404 for staff', async () => {
    const id = await seedBooking(
      managerUser,
      '2026-11-03T09:00',
      '2026-11-03T10:00',
    );
    const response = await router.request(
      `/rentals/bookings/${id}`,
      as(staffUser),
    );
    expect(response.status).toBe(404);
  });

  it('forbids staff from confirming and lets a manager confirm', async () => {
    const id = await seedBooking(
      staffUser,
      '2026-11-04T09:00',
      '2026-11-04T10:00',
    );

    const forbidden = await router.request(`/rentals/bookings/${id}/confirm`, {
      method: 'POST',
      ...as(staffUser),
    });
    expect(forbidden.status).toBe(403);

    const confirmed = await router.request(`/rentals/bookings/${id}/confirm`, {
      method: 'POST',
      ...as(managerUser),
    });
    expect(confirmed.status).toBe(200);
    const body = (await confirmed.json()) as { data: { status: string } };
    expect(body.data.status).toBe('confirmed');
  });

  it('rejects a repeated confirmation with 409', async () => {
    const id = await seedBooking(
      staffUser,
      '2026-11-05T09:00',
      '2026-11-05T10:00',
    );
    await router.request(`/rentals/bookings/${id}/confirm`, {
      method: 'POST',
      ...as(managerUser),
    });

    const repeated = await router.request(`/rentals/bookings/${id}/confirm`, {
      method: 'POST',
      ...as(managerUser),
    });
    expect(repeated.status).toBe(409);
    const body = (await repeated.json()) as { code: string };
    expect(body.code).toBe('INVALID_STATUS');
  });

  it('rejects an overlapping booking with 409', async () => {
    await seedBooking(staffUser, '2026-11-06T09:00', '2026-11-06T11:00');
    const response = await router.request('/rentals/bookings', {
      method: 'POST',
      ...as(staffUser),
      headers: { 'x-test-user': staffUser, 'content-type': 'application/json' },
      body: JSON.stringify({
        venueId,
        tenantId,
        title: '重叠预订',
        startAt: '2026-11-06T10:00',
        endAt: '2026-11-06T12:00',
      }),
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('TIME_CONFLICT');
  });

  it('creates a booking for the caller and ignores a staff-supplied owner', async () => {
    const response = await router.request('/rentals/bookings', {
      method: 'POST',
      ...as(staffUser),
      headers: { 'x-test-user': staffUser, 'content-type': 'application/json' },
      body: JSON.stringify({
        venueId,
        tenantId,
        title: '我的预订',
        startAt: '2026-11-07T09:00',
        endAt: '2026-11-07T10:00',
        ownerId: managerUser,
      }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      data: { ownerId: string; reference: string; status: string };
    };
    expect(body.data.ownerId).toBe(staffUser);
    expect(body.data.status).toBe('pending');
    expect(body.data.reference).toMatch(/^BK-\d{4}-\d{4}$/);
  });

  it('lets only a manager list owners', async () => {
    expect(
      (await router.request('/rentals/owners', as(staffUser))).status,
    ).toBe(403);
    expect(
      (await router.request('/rentals/owners', as(managerUser))).status,
    ).toBe(200);
  });

  it('summarises the caller scope', async () => {
    await seedBooking(staffUser, '2026-11-08T09:00', '2026-11-08T12:00');
    await seedBooking(managerUser, '2026-11-09T09:00', '2026-11-09T18:00');

    const staffSummary = await router.request(
      '/rentals/summary?from=2026-11-01T00:00:00.000Z&to=2026-11-30T00:00:00.000Z',
      as(staffUser),
    );
    const staffBody = (await staffSummary.json()) as {
      data: { totals: { bookings: number } };
    };
    expect(staffBody.data.totals.bookings).toBe(1);

    const managerSummary = await router.request(
      '/rentals/summary?from=2026-11-01T00:00:00.000Z&to=2026-11-30T00:00:00.000Z',
      as(managerUser),
    );
    const managerBody = (await managerSummary.json()) as {
      data: { totals: { bookings: number } };
    };
    expect(managerBody.data.totals.bookings).toBe(2);
  });
});
