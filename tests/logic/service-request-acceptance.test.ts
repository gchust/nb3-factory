// @vitest-environment node
import { databaseManagerToken } from '@nocobase/db';
import { i18nToken } from '@nocobase/app-server/i18n';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import type { WorkflowRunOptions } from '@nocobase/app-plugin-workflow';
import { describe, expect, it } from 'vitest';

import {
  notifyAssignee,
  readRequestId,
  recordResult,
  registerAcceptance,
  type ServiceRequestRow,
} from '../../server/workflows/service-request-acceptance/server/acceptance.js';

interface SentNotification {
  idempotencyKey?: string;
  source?: { type?: string; referenceId?: string };
  messages: {
    inbox?: {
      to?: string;
      title?: string;
      body?: string;
      target?: { path?: string };
    };
  };
}

const TRANSLATIONS: Record<string, string> = {
  'serviceRequest.notification.title': 'Service request accepted',
  'serviceRequest.notification.bodyNormal':
    'Request "{{title}}" was accepted and assigned to you.',
  'serviceRequest.notification.bodyUrgent':
    'Urgent request "{{title}}" was accepted and assigned to you.',
};

function interpolate(
  template: string,
  params?: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/gu, (_match, key: string) =>
    String(params?.[key] ?? ''),
  );
}

/**
 * A tiny in-memory stand-in for the `serviceRequests` repository. The run
 * modules only call `findOne` and `updateOne`, so those are the only two the
 * fake implements; everything else would be untested surface.
 */
function createRequestsFixture(rows: ServiceRequestRow[]) {
  const updates: { filter: unknown; values: Partial<ServiceRequestRow> }[] = [];
  const repository = {
    async findOne({ filter }: { filter: { id: number } }) {
      return rows.find((row) => row.id === filter.id);
    },
    async updateOne({
      filter,
      values,
    }: {
      filter: { id: number };
      values: Partial<ServiceRequestRow>;
    }) {
      updates.push({ filter, values });
      const row = rows.find((candidate) => candidate.id === filter.id);
      if (row) Object.assign(row, values);
      return row;
    },
  };
  const database = { repository: () => repository };
  return { database, updates, rows };
}

function createOptions(fixture: {
  database: unknown;
  notifications: SentNotification[];
  warnings: string[];
}): WorkflowRunOptions {
  const services = new Map<unknown, unknown>([
    [databaseManagerToken, fixture.database],
    [
      notificationServiceToken,
      {
        async send(input: SentNotification) {
          fixture.notifications.push(input);
        },
      },
    ],
    [
      i18nToken,
      {
        resolveLocale: (locale: string) => locale,
        async ensureLocaleLoaded() {},
        getFixedT: () => (key: string, params?: Record<string, unknown>) =>
          interpolate(TRANSLATIONS[key] ?? key, params),
      },
    ],
  ]);
  return {
    services: {
      has: (token) => services.has(token),
      resolve: <T>(token: unknown): T => services.get(token) as T,
    },
    signal: new AbortController().signal,
    logger: {
      debug() {},
      info() {},
      warn: (_message: string, details?: unknown) => {
        fixture.warnings.push(String(details));
      },
      error() {},
    },
  } as WorkflowRunOptions;
}

function makeRow(
  overrides: Partial<ServiceRequestRow> = {},
): ServiceRequestRow {
  return {
    id: 1,
    title: 'Printer on the third floor is broken',
    urgent: true,
    assigneeId: '00000000-0000-4000-8000-000000000002',
    status: 'pending',
    result: null,
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    ...overrides,
  };
}

function createFixture(rows: ServiceRequestRow[] = [makeRow()]) {
  const requests = createRequestsFixture(rows);
  const notifications: SentNotification[] = [];
  const warnings: string[] = [];
  const options = createOptions({
    database: requests.database,
    notifications,
    warnings,
  });
  return { options, requests, notifications, warnings, rows };
}

describe('readRequestId', () => {
  it('accepts positive numbers and numeric strings', () => {
    expect(readRequestId(1)).toBe(1);
    expect(readRequestId('42')).toBe(42);
  });

  it.each([0, -1, 1.5, '1.5', 'abc', '', null, undefined, {}])(
    'rejects %p',
    (value) => {
      expect(() => readRequestId(value)).toThrow(/positive integer/u);
    },
  );
});

describe('registerAcceptance', () => {
  it('moves a pending request to processing and reports its notification fields', async () => {
    const { options, rows } = createFixture();

    const result = await registerAcceptance(options, 1);

    expect(result).toEqual({
      assigneeId: '00000000-0000-4000-8000-000000000002',
      urgent: true,
      title: 'Printer on the third floor is broken',
    });
    expect(rows[0].status).toBe('processing');
  });

  it('leaves an already-accepted request untouched on a repeat run', async () => {
    const { options, requests, rows } = createFixture([
      makeRow({ status: 'accepted_normal', result: 'normal' }),
    ]);

    await registerAcceptance(options, 1);
    await registerAcceptance(options, 1);

    expect(rows[0].status).toBe('accepted_normal');
    expect(requests.updates).toHaveLength(0);
  });

  it('fails when the request does not exist', async () => {
    const { options } = createFixture([]);
    await expect(registerAcceptance(options, 99)).rejects.toThrow(
      /was not found/u,
    );
  });
});

describe('recordResult', () => {
  it('records the urgent result', async () => {
    const { options, rows } = createFixture();

    await recordResult(options, 1, 'urgent');

    expect(rows[0]).toMatchObject({
      status: 'accepted_urgent',
      result: 'urgent',
    });
  });

  it('records the normal result', async () => {
    const { options, rows } = createFixture();

    await recordResult(options, 1, 'normal');

    expect(rows[0]).toMatchObject({
      status: 'accepted_normal',
      result: 'normal',
    });
  });

  it('is idempotent when the same acceptance is replayed', async () => {
    const { options, rows } = createFixture();

    await recordResult(options, 1, 'urgent');
    const firstUpdatedAt = rows[0].updatedAt;
    await recordResult(options, 1, 'urgent');

    expect(rows[0]).toMatchObject({
      status: 'accepted_urgent',
      result: 'urgent',
    });
    // A replayed run is allowed to refresh the timestamp but must not duplicate
    // or contradict the recorded result.
    expect(typeof rows[0].updatedAt).toBe('string');
    expect(rows[0].updatedAt >= firstUpdatedAt).toBe(true);
  });
});

describe('notifyAssignee', () => {
  it('sends one durable in-app message to the assignee that links to the request', async () => {
    const { options, notifications } = createFixture();

    await notifyAssignee(options, {
      requestId: 7,
      locale: 'en-US',
      assigneeId: 'user-2',
      urgent: true,
      title: 'Printer on the third floor is broken',
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      idempotencyKey: 'service-request-accepted:7',
      source: { type: 'service-request', referenceId: '7' },
      messages: {
        inbox: {
          to: 'user-2',
          title: 'Service request accepted',
          body: 'Urgent request "Printer on the third floor is broken" was accepted and assigned to you.',
          target: { path: '/service-requests/7' },
        },
      },
    });
  });

  it('uses the normal wording for a non-urgent request', async () => {
    const { options, notifications } = createFixture();

    await notifyAssignee(options, {
      requestId: 8,
      locale: 'en-US',
      assigneeId: 'user-2',
      urgent: false,
      title: 'Update the shared team mailbox',
    });

    expect(notifications[0].messages.inbox?.body).toBe(
      'Request "Update the shared team mailbox" was accepted and assigned to you.',
    );
  });

  it('sends nothing and warns when the request has no assignee', async () => {
    const { options, notifications, warnings } = createFixture();

    await notifyAssignee(options, {
      requestId: 9,
      locale: 'en-US',
      assigneeId: null,
      urgent: false,
      title: 'Unassigned request',
    });

    expect(notifications).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });

  it('sends the same message identity on a replayed run, so the channel can deduplicate', async () => {
    const { options, notifications } = createFixture();

    const input = {
      requestId: 7,
      locale: 'en-US',
      assigneeId: 'user-2',
      urgent: false,
      title: 'Printer on the third floor is broken',
    };
    await notifyAssignee(options, input);
    await notifyAssignee(options, input);

    expect(notifications).toHaveLength(2);
    expect(new Set(notifications.map((item) => item.idempotencyKey)).size).toBe(
      1,
    );
  });
});
