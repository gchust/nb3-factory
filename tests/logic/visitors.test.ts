// @vitest-environment node

import type { Auth } from '@nocobase/app-plugin-authentication/server';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import visitorMigration from '../../database/main/migrations/202601150001_create_visitors.js';
import visitorSeed from '../../database/main/seeds/202601150002_seed_visitors.js';
import {
  VisitorService,
  VisitorError,
  validateCreateVisitorInput,
} from '../../server/providers/visitor-service.js';
import { createVisitorRoutes } from '../../server/routes/visitors.js';
import {
  createVisitorTestDatabase,
  type VisitorTestDatabase,
} from './visitor-database.js';

const DAY = {
  from: '2026-01-15T00:00:00.000Z',
  to: '2026-01-16T00:00:00.000Z',
} as const;

/** A session gate that either admits every request or answers 401, standing in for the authentication plugin. */
function fakeAuth(authenticated: boolean): Pick<Auth, 'required'> {
  return {
    required: () => async (context, next) => {
      if (!authenticated) {
        return context.json({ code: 'UNAUTHENTICATED' }, 401);
      }
      await next();
    },
  } as unknown as Pick<Auth, 'required'>;
}

describe('visitor register', () => {
  let fixture: VisitorTestDatabase;
  let visitors: VisitorService;

  beforeEach(async () => {
    fixture = await createVisitorTestDatabase();
    await fixture.apply([visitorMigration]);
    visitors = new VisitorService(fixture.database);
  });

  afterEach(async () => {
    await fixture.close();
  });

  it('applies the migration and drops the collection again', async () => {
    const builder = fixture.database.builder('main');
    await expect(builder.hasCollection('visitors')).resolves.toBe(true);

    await fixture.revert([visitorMigration]);
    await expect(builder.hasCollection('visitors')).resolves.toBe(false);
  });

  it('registers a visitor and normalizes the request fields', async () => {
    const created = await visitors.create({
      name: '  张伟  ',
      phone: ' 13800000001 ',
      reason: ' 面试 ',
      employeeName: ' 王芳 ',
      arrivedAt: '2026-01-15T09:20:00+08:00',
    });

    expect(created).toMatchObject({
      name: '张伟',
      phone: '13800000001',
      reason: '面试',
      employeeName: '王芳',
      arrivedAt: '2026-01-15T01:20:00.000Z',
      departedAt: null,
    });

    await expect(visitors.getById(created.id)).resolves.toEqual(created);
  });

  it('reports the failing fields of an invalid registration', () => {
    expect(
      validateCreateVisitorInput({
        name: '   ',
        phone: '138',
        reason: '',
        employeeName: '',
        arrivedAt: '',
      }),
    ).toEqual({
      name: 'REQUIRED',
      phone: 'INVALID_FORMAT',
      reason: 'REQUIRED',
      employeeName: 'REQUIRED',
      arrivedAt: 'REQUIRED',
    });

    expect(
      validateCreateVisitorInput({
        name: '张伟',
        phone: '13800000001',
        reason: '面试',
        employeeName: '王芳',
        arrivedAt: '2026-01-15T01:20:00.000Z',
      }),
    ).toEqual({});
  });

  it('rejects a registration whose phone is not eleven digits', async () => {
    await expect(
      visitors.create({
        name: '张伟',
        phone: '1380000000',
        reason: '面试',
        employeeName: '王芳',
        arrivedAt: '2026-01-15T01:20:00.000Z',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { phone: 'INVALID_FORMAT' },
    });
  });

  it('filters the register by day, employee, status and free text', async () => {
    await visitors.create({
      name: '张伟',
      phone: '13800000001',
      reason: '面试',
      employeeName: '王芳',
      arrivedAt: '2026-01-15T01:20:00.000Z',
    });
    const left = await visitors.create({
      name: '李娜',
      phone: '13800000002',
      reason: '商务洽谈',
      employeeName: 'David Lee',
      arrivedAt: '2026-01-15T02:10:00.000Z',
    });
    await visitors.checkout(left.id, '2026-01-15T03:40:00.000Z');
    await visitors.create({
      name: 'Michael Brown',
      phone: '13800000006',
      reason: '供应商送货',
      employeeName: '陈静',
      arrivedAt: '2026-01-14T00:45:00.000Z',
    });

    const onTheDay = await visitors.list(DAY);
    expect(onTheDay.map((visitor) => visitor.name)).toEqual(['李娜', '张伟']);

    const stillOnSite = await visitors.list({ ...DAY, status: 'onSite' });
    expect(stillOnSite.map((visitor) => visitor.name)).toEqual(['张伟']);

    const leftAlready = await visitors.list({ ...DAY, status: 'left' });
    expect(leftAlready.map((visitor) => visitor.name)).toEqual(['李娜']);

    const byEmployee = await visitors.list({ employeeName: 'David Lee' });
    expect(byEmployee.map((visitor) => visitor.name)).toEqual(['李娜']);

    const byPhone = await visitors.list({ search: '13800000006' });
    expect(byPhone.map((visitor) => visitor.name)).toEqual(['Michael Brown']);
  });

  it('lists the distinct visited employees', async () => {
    await visitors.create({
      name: '张伟',
      phone: '13800000001',
      reason: '面试',
      employeeName: '王芳',
      arrivedAt: '2026-01-15T01:20:00.000Z',
    });
    await visitors.create({
      name: '李娜',
      phone: '13800000002',
      reason: '商务洽谈',
      employeeName: 'David Lee',
      arrivedAt: '2026-01-15T02:10:00.000Z',
    });
    await visitors.create({
      name: '刘洋',
      phone: '13800000005',
      reason: '面试',
      employeeName: '王芳',
      arrivedAt: '2026-01-15T06:15:00.000Z',
    });

    await expect(visitors.listEmployeeNames()).resolves.toEqual([
      'David Lee',
      '王芳',
    ]);
  });

  it('records a departure and refuses an invalid or repeated one', async () => {
    const created = await visitors.create({
      name: '张伟',
      phone: '13800000001',
      reason: '面试',
      employeeName: '王芳',
      arrivedAt: '2026-01-15T01:20:00.000Z',
    });

    await expect(
      visitors.checkout(created.id, '2026-01-15T00:00:00.000Z'),
    ).rejects.toMatchObject({ code: 'DEPARTED_BEFORE_ARRIVED' });

    const checkedOut = await visitors.checkout(
      created.id,
      '2026-01-15T02:05:00.000Z',
    );
    expect(checkedOut.departedAt).toBe('2026-01-15T02:05:00.000Z');

    await expect(
      visitors.checkout(created.id, '2026-01-15T03:00:00.000Z'),
    ).rejects.toMatchObject({ code: 'ALREADY_DEPARTED' });

    await expect(
      visitors.checkout(9999, '2026-01-15T03:00:00.000Z'),
    ).rejects.toMatchObject({ code: 'VISITOR_NOT_FOUND' });
  });

  it('seeds the sample register once', async () => {
    await fixture.runSeed(visitorSeed);
    await fixture.runSeed(visitorSeed);

    await expect(visitors.list()).resolves.toHaveLength(7);
    await expect(visitors.list({ status: 'onSite' })).resolves.toHaveLength(4);
    await expect(visitors.listEmployeeNames()).resolves.toEqual([
      'David Lee',
      '王芳',
      '陈静',
    ]);
  });
});

describe('visitor register API', () => {
  let fixture: VisitorTestDatabase;
  let service: VisitorService;

  const app = (authenticated: boolean): Hono => {
    const routes = new Hono();
    routes.route(
      '/visitors',
      createVisitorRoutes({
        auth: fakeAuth(authenticated),
        visitors: service,
      }),
    );
    return routes;
  };

  beforeEach(async () => {
    fixture = await createVisitorTestDatabase();
    await fixture.apply([visitorMigration]);
    service = new VisitorService(fixture.database);
  });

  afterEach(async () => {
    await fixture.close();
  });

  const jsonRequest = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  it('refuses an unauthenticated request', async () => {
    const response = await app(false).request('/visitors');
    expect(response.status).toBe(401);
  });

  it('registers a visitor and lists it', async () => {
    const created = await app(true).request(
      '/visitors',
      jsonRequest('POST', {
        name: '张伟',
        phone: '13800000001',
        reason: '面试',
        employeeName: '王芳',
        arrivedAt: '2026-01-15T01:20:00.000Z',
      }),
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as { data: { id: number } };

    const listed = await app(true).request('/visitors');
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: body.data.id,
          name: '张伟',
          departedAt: null,
        }),
      ],
    });
  });

  it('answers 400 with the failing fields of an invalid payload', async () => {
    const response = await app(true).request(
      '/visitors',
      jsonRequest('POST', {
        name: '',
        phone: '138',
        reason: '',
        employeeName: '',
        arrivedAt: '',
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'VALIDATION_ERROR',
      errors: {
        name: 'REQUIRED',
        phone: 'INVALID_FORMAT',
        reason: 'REQUIRED',
        employeeName: 'REQUIRED',
        arrivedAt: 'REQUIRED',
      },
    });
  });

  it('filters, reads one, and lists the employees over HTTP', async () => {
    const created = await service.create({
      name: '张伟',
      phone: '13800000001',
      reason: '面试',
      employeeName: '王芳',
      arrivedAt: '2026-01-15T01:20:00.000Z',
    });
    await service.create({
      name: 'Michael Brown',
      phone: '13800000006',
      reason: '供应商送货',
      employeeName: '陈静',
      arrivedAt: '2026-01-14T00:45:00.000Z',
    });

    const filtered = await app(true).request(
      `/visitors?from=${encodeURIComponent(DAY.from)}&to=${encodeURIComponent(DAY.to)}&status=onSite`,
    );
    await expect(filtered.json()).resolves.toEqual({
      data: [expect.objectContaining({ id: created.id, name: '张伟' })],
    });

    const one = await app(true).request(`/visitors/${created.id}`);
    expect(one.status).toBe(200);
    await expect(one.json()).resolves.toMatchObject({
      data: { id: created.id, name: '张伟' },
    });

    const missing = await app(true).request('/visitors/9999');
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({
      code: 'VISITOR_NOT_FOUND',
    });

    const employees = await app(true).request('/visitors/employee-names');
    await expect(employees.json()).resolves.toEqual({
      data: ['王芳', '陈静'],
    });
  });

  it('records a departure and reports the domain failures as statuses', async () => {
    const created = await service.create({
      name: '张伟',
      phone: '13800000001',
      reason: '面试',
      employeeName: '王芳',
      arrivedAt: '2026-01-15T01:20:00.000Z',
    });

    const tooEarly = await app(true).request(
      `/visitors/${created.id}/checkout`,
      jsonRequest('PATCH', { departedAt: '2026-01-15T00:00:00.000Z' }),
    );
    expect(tooEarly.status).toBe(400);
    await expect(tooEarly.json()).resolves.toEqual({
      code: 'DEPARTED_BEFORE_ARRIVED',
    });

    const checkedOut = await app(true).request(
      `/visitors/${created.id}/checkout`,
      jsonRequest('PATCH', { departedAt: '2026-01-15T02:05:00.000Z' }),
    );
    expect(checkedOut.status).toBe(200);
    await expect(checkedOut.json()).resolves.toMatchObject({
      data: { departedAt: '2026-01-15T02:05:00.000Z' },
    });

    const again = await app(true).request(
      `/visitors/${created.id}/checkout`,
      jsonRequest('PATCH', { departedAt: '2026-01-15T03:00:00.000Z' }),
    );
    expect(again.status).toBe(409);
    await expect(again.json()).resolves.toEqual({
      code: 'ALREADY_DEPARTED',
    });
  });

  it('keeps the visitor error class usable by callers', () => {
    const error = new VisitorError('ALREADY_DEPARTED');
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('ALREADY_DEPARTED');
  });
});
