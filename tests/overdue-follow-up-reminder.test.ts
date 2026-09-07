import { describe, expect, it } from 'vitest';
import { databaseManagerToken } from '@nocobase/db';
import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import type { WorkflowRunRuntime } from '@nocobase/app-plugin-workflow';

import { run as notifyOverdueFollowUps } from '../server/workflows/overdue-follow-up-reminder/server/notify-overdue-follow-ups.js';
import { DefaultSalesService } from '../server/providers/sales-service.js';
import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization';
import { createTestDatabase } from './helpers/sales-test-db.js';

const ALL_RECORDS: DatabaseAuthorizationConditions = {
  type: 'database',
  collection: 'main.customers',
  action: 'read',
  filter: { $and: [] },
  fields: { input: '*', output: '*' },
};

const OWNER = 'user-owner';

interface SentNotification {
  to: { type: string; id: string };
  content: { title?: string; body: string; actionUrl?: string };
}

function createRuntime(
  database: ReturnType<typeof createTestDatabase> extends Promise<infer T>
    ? T['database']
    : never,
  sent: SentNotification[],
): WorkflowRunRuntime {
  const notification = {
    send: async (input: {
      to: { type: string; id: string };
      content: { title?: string; body: string; actionUrl?: string };
    }) => {
      sent.push(input);
      return {
        notificationId: 'n-1',
        status: 'completed',
        deliveries: [],
      };
    },
  };
  return {
    app: {
      container: {
        resolve: (token: unknown) => {
          if (token === databaseManagerToken) return database;
          if (token === notificationServiceToken) return notification;
          throw new Error(
            `Unexpected token resolved in test: ${String(token)}`,
          );
        },
      },
    },
    signal: new AbortController().signal,
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  };
}

describe('overdue follow-up reminder workflow', () => {
  it('sends one reminder per overdue follow-up and never duplicates per day', async () => {
    const { database } = await createTestDatabase({ users: [OWNER] });
    try {
      const service = new DefaultSalesService(database);
      const { id: customerId } = await service.createCustomer(
        { name: '客户' },
        OWNER,
        ALL_RECORDS,
      );
      const { id: opportunityId } = await service.createOpportunity(
        { name: '商机', customerId },
        OWNER,
        ALL_RECORDS,
      );
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await service.createFollowUp(
        {
          subject: '逾期跟进',
          customerId,
          opportunityId,
          followUpAt: yesterday,
          nextFollowUpAt: yesterday,
        },
        OWNER,
        ALL_RECORDS,
      );
      // A follow-up with no next time is not overdue.
      await service.createFollowUp(
        { subject: '未排期', customerId, followUpAt: yesterday },
        OWNER,
        ALL_RECORDS,
      );

      const sent: SentNotification[] = [];
      const runtime = createRuntime(database, sent);
      const date = new Date().toISOString().slice(0, 10);

      const first = await notifyOverdueFollowUps({ date }, runtime);
      expect(first).toMatchObject({ sent: 1, skipped: 0, date });
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toEqual({ type: 'user', id: OWNER });
      expect(sent[0].content.body).toContain('逾期跟进');
      expect(sent[0].content.actionUrl).toBe(`/opportunities/${opportunityId}`);

      // Re-running the same date is idempotent: no duplicate notification.
      const second = await notifyOverdueFollowUps({ date }, runtime);
      expect(second).toMatchObject({ sent: 0, skipped: 1, date });
      expect(sent).toHaveLength(1);
    } finally {
      await database.destroy();
    }
  });

  it('rejects an invalid date argument', async () => {
    const { database } = await createTestDatabase({ users: [OWNER] });
    try {
      const sent: SentNotification[] = [];
      const runtime = createRuntime(database, sent);
      await expect(
        notifyOverdueFollowUps({ date: 'not-a-date' }, runtime),
      ).rejects.toThrow('Invalid overdue reminder date.');
      await expect(notifyOverdueFollowUps({}, runtime)).rejects.toThrow(
        'Invalid overdue reminder date.',
      );
    } finally {
      await database.destroy();
    }
  });
});
