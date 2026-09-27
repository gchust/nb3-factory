// @vitest-environment node
import type { DatabaseManager, Row } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import {
  ServiceError,
  serviceAccessToken,
  type ServiceAccessService,
  type ServiceIdentity,
} from '../../server/service/access.js';
import { ServiceTicketService } from '../../server/service/tickets.js';

/**
 * Retrying a ticket action.
 *
 * A client that retries an action after a network timeout must not be told the
 * action is now illegal, and must not have it applied twice. `requestKey`
 * identifies an attempt, so the recorded result is returned even though the
 * first attempt already moved the ticket out of the status the action starts
 * from. These cases pin that ordering with a ticket already in
 * `pending_assignment` and a recorded `submit` attempt.
 */

const ADMIN: ServiceIdentity = {
  userId: 'user-admin',
  roles: ['service-admin'],
  membershipIds: [],
  regions: [],
  manageAll: true,
  allTickets: true,
  regionTickets: false,
  assignedTickets: false,
  sharedTickets: false,
  internalFields: true,
  manageKnowledge: true,
  manageInspections: true,
  shareTickets: true,
  integrationEvents: true,
  assistant: true,
  customers: 'all',
  devices: 'all',
};

const TICKET: Row = {
  id: 7,
  status: 'pending_assignment',
  title: 'Pump failure',
  priority: 'high',
  region: 'east',
  confidential: false,
  assigneeId: null,
  reporterId: 'user-admin',
};

class FakeSelect {
  private requestKey: string | null = null;

  constructor(private readonly table: string) {}

  selectAll(): this {
    return this;
  }

  select(): this {
    return this;
  }

  where(column?: unknown, _operator?: unknown, value?: unknown): this {
    if (column === 'requestKey') {
      this.requestKey = typeof value === 'string' ? value : null;
    }
    return this;
  }

  orderBy(): this {
    return this;
  }

  execute(): Promise<Row[]> {
    return Promise.resolve(
      this.table === 'service_ticket_logs' ? [RECORDED] : [],
    );
  }

  executeTakeFirst(): Promise<Row | undefined> {
    if (this.table === 'service_tickets') return Promise.resolve(TICKET);
    if (this.table === 'service_ticket_logs') {
      return Promise.resolve(
        this.requestKey === 'retry-key' ? RECORDED : undefined,
      );
    }
    return Promise.resolve(undefined);
  }
}

const RECORDED: Row = {
  id: 91,
  ticketId: 7,
  kind: 'transition',
  action: 'submit',
  requestKey: 'retry-key',
};

function createService() {
  const database = {
    query: () => ({ selectFrom: (table: string) => new FakeSelect(table) }),
  } as unknown as DatabaseManager;

  const container = new ServiceContainer();
  container.instance(serviceAccessToken, {
    requireTicketWrite: () => Promise.resolve(),
    requireTicketRead: () => Promise.resolve(),
  } as unknown as ServiceAccessService);

  return new ServiceTicketService(database, container);
}

describe('service ticket retry', () => {
  it('returns the recorded result instead of failing the transition again', async () => {
    const service = createService();
    const result = await service.applyAction({
      ticketId: 7,
      action: 'submit',
      payload: {},
      requestKey: 'retry-key',
      actor: { id: 'user-admin', name: 'Admin' },
      identity: ADMIN,
    });
    expect(result.replayed).toBe(true);
    expect(result.ticket).toBe(TICKET);
    expect(result.logs).toHaveLength(1);
  });

  it('refuses to reuse a key for a different action', async () => {
    const service = createService();
    await expect(
      service.applyAction({
        ticketId: 7,
        action: 'confirm',
        payload: {},
        requestKey: 'retry-key',
        actor: { id: 'user-admin', name: 'Admin' },
        identity: ADMIN,
      }),
    ).rejects.toMatchObject({ code: 'REQUEST_KEY_REUSED', status: 409 });
  });

  it('still rejects an action the current status does not allow', async () => {
    const service = createService();
    await expect(
      service.applyAction({
        ticketId: 7,
        action: 'submit',
        payload: {},
        requestKey: 'fresh-key',
        actor: { id: 'user-admin', name: 'Admin' },
        identity: ADMIN,
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});
