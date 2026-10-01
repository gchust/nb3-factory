// @vitest-environment node

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { NotificationService } from '@nocobase/app-plugin-notification/server';
import { createDatabaseManager, defineDatabase } from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AccessService } from '../../server/services/access-service.js';
import {
  ROLE_KEYS,
  ROOT_PERMISSION_SET,
  TICKET_STATUS,
  type BusinessRole,
  type ServiceActor,
  type ServiceError,
} from '../../server/services/contracts.js';
import { DashboardService } from '../../server/services/dashboard-service.js';
import { InspectionService } from '../../server/services/inspection-service.js';
import { IntegrationKeyService } from '../../server/services/integration-key-service.js';
import { KnowledgeService } from '../../server/services/knowledge-service.js';
import { LedgerService } from '../../server/services/ledger-service.js';
import { ServiceNotificationService } from '../../server/services/notification-service.js';
import { TicketService } from '../../server/services/ticket-service.js';

type TestDatabase = ReturnType<typeof createDatabaseManager>;

const USER_ROLE_IDS: Record<string, readonly string[]> = {
  'u-root': [ROOT_PERMISSION_SET],
  'u-supervisor': [ROLE_KEYS.supervisor],
  'u-alpha': [ROLE_KEYS.engineer],
  'u-beta': [ROLE_KEYS.engineer],
  'u-observer': [ROLE_KEYS.observer],
  'u-integration': [ROLE_KEYS.integration],
};

interface SentMessage {
  idempotencyKey: string;
  to: string;
  title: string;
}

/** A notification service that actually honors idempotency keys, like the plugin does. */
class FakeNotificationService {
  readonly sent: SentMessage[] = [];
  private readonly keys = new Set<string>();

  send(input: {
    idempotencyKey: string;
    source: { type: string; referenceId?: string };
    messages: { inApp: { to: string; title: string } };
  }): Promise<{ notificationId: string; deduplicated: boolean }> {
    if (this.keys.has(input.idempotencyKey)) {
      return Promise.resolve({
        notificationId: input.idempotencyKey,
        deduplicated: true,
      });
    }
    this.keys.add(input.idempotencyKey);
    this.sent.push({
      idempotencyKey: input.idempotencyKey,
      to: input.messages.inApp.to,
      title: input.messages.inApp.title,
    });
    return Promise.resolve({
      notificationId: input.idempotencyKey,
      deduplicated: false,
    });
  }

  getByIdempotencyKey(key: string): Promise<{ id: string } | undefined> {
    return Promise.resolve(this.keys.has(key) ? { id: key } : undefined);
  }
}

interface Harness {
  database: TestDatabase;
  access: AccessService;
  ledger: LedgerService;
  tickets: TicketService;
  inspections: InspectionService;
  knowledge: KnowledgeService;
  dashboard: DashboardService;
  notifications: FakeNotificationService;
  actor(id: string): Promise<ServiceActor>;
  roleUserIds(role: BusinessRole): Promise<string[]>;
  customerId: number;
  deviceId: number;
}

let harness: Harness;

async function createHarness(): Promise<Harness> {
  const dir = mkdtempSync(path.join(tmpdir(), 'nb-service-business-'));
  const database = createDatabaseManager(
    defineDatabase({
      default: 'main',
      connections: {
        main: sqlite({ filename: path.join(dir, 'test.sqlite') }),
      },
    }),
  );
  const migrator = database.createMigrator({
    directory: path.resolve(process.cwd(), 'database/main/migrations'),
    packageName: 'nb3-factory',
  });
  await migrator.latest();
  await database.builder().createCollection('user', (collection) => {
    collection.increments('id');
    collection.string('name', { length: 128 });
  });

  const assignments = Object.entries(USER_ROLE_IDS).flatMap(([id, sets]) =>
    sets.map((permissionSet) => ({
      subject: { type: 'user', id },
      permissionSet,
    })),
  );
  const authorization = {
    permissionSets: {
      listAssignments: () => Promise.resolve(assignments),
    },
  } as unknown as AppAuthorization;
  const access = new AccessService(authorization);
  const notifications = new FakeNotificationService();
  const notificationService = new ServiceNotificationService(
    notifications as unknown as NotificationService,
  );
  const ledger = new LedgerService(database, access);
  const tickets = new TicketService(database, access, notificationService);
  const inspections = new InspectionService(
    database,
    access,
    notificationService,
    tickets,
  );
  const knowledge = new KnowledgeService(database, access);
  const dashboard = new DashboardService(database, access);

  const resolveActor = async (id: string): Promise<ServiceActor> =>
    access.resolveActor(id);
  const supervisor = await resolveActor('u-supervisor');
  const customer = await ledger.createCustomer(supervisor, {
    name: 'Fictional Circuits Ltd.',
    contactName: 'Wang Lei',
    contactPhone: '13800000000',
  });
  const device = await ledger.createDevice(supervisor, {
    code: 'DEV-T-001',
    name: 'Floor A Air Compressor',
    customerId: customer.id,
    engineerId: 'u-alpha',
    nextInspectionDate: '2020-01-01',
  });

  return {
    database,
    access,
    ledger,
    tickets,
    inspections,
    knowledge,
    dashboard,
    notifications,
    actor: resolveActor,
    roleUserIds: (role) => access.listUserIdsByRole(role),
    customerId: customer.id,
    deviceId: device.id,
  };
}

function actorId(actor: ServiceActor): string {
  return actor.id;
}

async function expectServiceError(
  action: () => Promise<unknown>,
  status: number,
): Promise<void> {
  let caught: ServiceError | undefined;
  try {
    await action();
  } catch (error) {
    caught = error as ServiceError;
  }
  expect(caught, 'expected the call to throw').toBeDefined();
  expect(caught?.status).toBe(status);
}

beforeAll(async () => {
  harness = await createHarness();
});

afterAll(async () => {
  await harness.database.destroy();
});

describe('ticket closed loop', () => {
  it('runs acceptance, processing, confirmation and closes the loop', async () => {
    const supervisor = await harness.actor('u-supervisor');
    const alpha = await harness.actor('u-alpha');

    const created = await harness.tickets.createTicket(supervisor, {
      title: 'Compressor overheats',
      description: 'The unit shuts itself off after ten minutes.',
      customerId: harness.customerId,
      deviceId: harness.deviceId,
      priority: 'normal',
    });
    expect(created.status).toBe(TICKET_STATUS.pendingAcceptance);
    expect(created.assigneeId).toBe('u-alpha');

    const accepted = await harness.tickets.acceptTicket(
      supervisor,
      created.id,
      'Accepted for the floor A queue.',
    );
    expect(accepted.changed).toBe(true);
    expect(accepted.ticket.status).toBe(TICKET_STATUS.pendingProcessing);
    expect(accepted.ticket.assigneeId).toBe('u-alpha');
    expect(accepted.ticket.dueAt).toBeTruthy();
    expect(
      harness.notifications.sent.some(
        (message) => message.idempotencyKey === `ticket-accept:${created.id}`,
      ),
    ).toBe(true);

    const acceptAgain = await harness.tickets.acceptTicket(
      supervisor,
      created.id,
    );
    expect(acceptAgain.changed).toBe(false);
    expect(
      harness.notifications.sent.filter(
        (message) => message.idempotencyKey === `ticket-accept:${created.id}`,
      ),
    ).toHaveLength(1);

    const processing = await harness.tickets.startProcessing(
      alpha,
      created.id,
      'Replaced the thermal cutoff.',
    );
    expect(processing.status).toBe(TICKET_STATUS.processing);

    const submitted = await harness.tickets.submitResult(alpha, created.id, {
      resultNote: 'Replaced the cutoff and verified an hour of runtime.',
    });
    expect(submitted.status).toBe(TICKET_STATUS.pendingConfirmation);
    expect(
      harness.notifications.sent.some((message) =>
        message.idempotencyKey.startsWith(`ticket-submit:${created.id}:`),
      ),
    ).toBe(true);

    const closed = await harness.tickets.confirmTicket(
      supervisor,
      created.id,
      'Verified on site.',
    );
    expect(closed.status).toBe(TICKET_STATUS.closed);
    expect(closed.closedAt).toBeTruthy();
    expect(
      harness.notifications.sent.some(
        (message) => message.idempotencyKey === `ticket-close:${created.id}`,
      ),
    ).toBe(true);
  });

  it('returns a submitted result and lets the engineer resubmit', async () => {
    const supervisor = await harness.actor('u-supervisor');
    const alpha = await harness.actor('u-alpha');
    const created = await harness.tickets.createTicket(supervisor, {
      title: 'Belt replacement',
      customerId: harness.customerId,
      deviceId: harness.deviceId,
    });
    await harness.tickets.acceptTicket(supervisor, created.id);
    await harness.tickets.startProcessing(alpha, created.id);
    await harness.tickets.submitResult(alpha, created.id, {
      resultNote: 'Belt replaced.',
    });

    const returned = await harness.tickets.returnTicket(
      supervisor,
      created.id,
      'Please attach the tension reading.',
    );
    expect(returned.status).toBe(TICKET_STATUS.processing);
    expect(returned.rejectReason).toBe('Please attach the tension reading.');

    const resubmitted = await harness.tickets.submitResult(alpha, created.id, {
      resultNote: 'Belt replaced and tension recorded.',
    });
    expect(resubmitted.status).toBe(TICKET_STATUS.pendingConfirmation);
    expect(resubmitted.rejectReason).toBeNull();
  });

  it('refuses processing by an engineer who is not the assignee', async () => {
    const supervisor = await harness.actor('u-supervisor');
    const beta = await harness.actor('u-beta');
    const created = await harness.tickets.createTicket(supervisor, {
      title: 'Valve inspection',
      customerId: harness.customerId,
      deviceId: harness.deviceId,
    });
    await harness.tickets.acceptTicket(supervisor, created.id);
    await expectServiceError(
      () => harness.tickets.startProcessing(beta, created.id),
      403,
    );
  });
});

describe('read scopes', () => {
  it('keeps observers to closed, non-confidential summaries', async () => {
    const observer = await harness.actor('u-observer');
    const supervisor = await harness.actor('u-supervisor');
    const alpha = await harness.actor('u-alpha');

    const open = await harness.tickets.createTicket(supervisor, {
      title: 'Observer cannot see this open ticket yet',
      customerId: harness.customerId,
      deviceId: harness.deviceId,
    });
    expect(open.status).toBe(TICKET_STATUS.pendingAcceptance);

    const listBefore = await harness.tickets.listTickets(observer, {
      keyword: 'Observer cannot see',
    });
    expect(listBefore.total).toBe(0);
    await expectServiceError(
      () => harness.tickets.getTicket(observer, open.id),
      403,
    );

    await harness.tickets.acceptTicket(supervisor, open.id);
    await harness.tickets.startProcessing(alpha, open.id, 'Inspected.');
    await harness.tickets.submitResult(alpha, open.id, {
      resultNote: 'Internal result note the observer must not see.',
    });
    await harness.tickets.confirmTicket(supervisor, open.id, 'Closed.');

    const summary = await harness.tickets.getTicket(observer, open.id);
    expect(summary.status).toBe(TICKET_STATUS.closed);
    expect(summary.summaryOnly).toBe(true);
    expect(summary.processNote).toBeUndefined();
    expect(summary.resultNote).toBeUndefined();
  });

  it('keeps the integration account to its own external tickets', async () => {
    const integration = await harness.actor('u-integration');
    const supervisor = await harness.actor('u-supervisor');
    const internal = await harness.tickets.createTicket(supervisor, {
      title: 'Internal-only ticket',
      customerId: harness.customerId,
      deviceId: harness.deviceId,
    });
    await expectServiceError(
      () => harness.tickets.getTicket(integration, internal.id),
      403,
    );
    await expectServiceError(
      () => harness.ledger.listCustomers(integration),
      403,
    );
  });
});

describe('collaboration shares', () => {
  it('grants read-only access to a shared engineer without processing rights', async () => {
    const supervisor = await harness.actor('u-supervisor');
    const beta = await harness.actor('u-beta');
    const created = await harness.tickets.createTicket(supervisor, {
      title: 'Shared knowledge on a pump',
      customerId: harness.customerId,
      deviceId: harness.deviceId,
    });
    await harness.tickets.acceptTicket(supervisor, created.id);

    await expectServiceError(
      () => harness.tickets.getTicket(beta, created.id),
      403,
    );

    await harness.tickets.shareTicket(supervisor, created.id, {
      engineerId: 'u-beta',
    });

    const shared = await harness.tickets.getTicket(beta, created.id);
    expect(shared.shared).toBe(true);
    await expectServiceError(
      () => harness.tickets.startProcessing(beta, created.id),
      403,
    );
  });

  it('never shares a confidential ticket', async () => {
    const supervisor = await harness.actor('u-supervisor');
    const created = await harness.tickets.createTicket(supervisor, {
      title: 'Confidential customer escalation',
      customerId: harness.customerId,
      deviceId: harness.deviceId,
      confidential: true,
    });
    await expectServiceError(
      () =>
        harness.tickets.shareTicket(supervisor, created.id, {
          engineerId: 'u-beta',
        }),
      403,
    );
  });
});

describe('knowledge access', () => {
  it('hides drafts from engineers until they are published', async () => {
    const supervisor = await harness.actor('u-supervisor');
    const alpha = await harness.actor('u-alpha');

    const draft = await harness.knowledge.createArticle(supervisor, {
      title: 'Draft: compressor torque values',
      body: 'Internal torque table.',
      published: false,
    });
    await expectServiceError(
      () => harness.knowledge.getArticle(alpha, draft.id),
      404,
    );

    const engineerList = await harness.knowledge.listArticles(alpha);
    expect(engineerList.some((article) => article.id === draft.id)).toBe(false);

    await harness.knowledge.updateArticle(supervisor, draft.id, {
      published: true,
    });
    const publishedList = await harness.knowledge.listArticles(alpha);
    expect(publishedList.some((article) => article.id === draft.id)).toBe(true);

    await expectServiceError(
      () =>
        harness.knowledge.createArticle(alpha, {
          title: 'Engineers cannot author knowledge',
        }),
      403,
    );
  });
});

describe('daily inspection and reminder jobs', () => {
  it('generates at most one inspection per device per day', async () => {
    const first = await harness.inspections.generateDueInspections(new Date());
    expect(first.deviceIds).toContain(harness.deviceId);
    const createdId = first.deviceIds.length;

    // Re-arm the schedule so the device is due again the same calendar day; the
    // deduplication guard, not the advanced schedule, must stop a second record.
    await harness.database.repository('serviceDevices').updateOne({
      filter: { id: harness.deviceId },
      values: { nextInspectionDate: '2020-01-01' },
    });
    const second = await harness.inspections.generateDueInspections(new Date());
    expect(second.deviceIds).not.toContain(harness.deviceId);
    expect(second.skipped).toBeGreaterThanOrEqual(1);
    expect(createdId).toBe(1);

    const inspections = await harness.inspections.listInspections(
      await harness.actor('u-supervisor'),
      { deviceId: harness.deviceId },
    );
    expect(inspections).toHaveLength(1);

    const device = await harness.ledger.getDevice(
      await harness.actor('u-supervisor'),
      harness.deviceId,
    );
    // A skipped run leaves the schedule untouched; the next successful run owns
    // advancing it, so a catch-up run never drifts the plan.
    expect(device.nextInspectionDate).toBe('2020-01-01');
  });

  it('reminds about an overdue ticket at most once per day', async () => {
    const supervisor = await harness.actor('u-supervisor');
    const alpha = await harness.actor('u-alpha');
    const created = await harness.tickets.createTicket(supervisor, {
      title: 'Overdue overdue overdue',
      customerId: harness.customerId,
      deviceId: harness.deviceId,
    });
    await harness.tickets.acceptTicket(supervisor, created.id);
    await harness.tickets.startProcessing(alpha, created.id);
    // Force the due date into the past, which acceptance will not do by itself.
    await harness.database.repository('serviceTickets').updateOne({
      filter: { id: created.id },
      values: { dueAt: new Date(Date.now() - 86_400_000) },
    });

    const first = await harness.inspections.remindOverdueTickets();
    expect(first.ticketIds).toContain(created.id);

    const second = await harness.inspections.remindOverdueTickets();
    expect(second.ticketIds).not.toContain(created.id);

    expect(await harness.roleUserIds('supervisor')).toEqual(['u-supervisor']);
  });
});

describe('external device-platform interface', () => {
  it('deduplicates by external event number and rejects other accounts', async () => {
    const integration = await harness.actor('u-integration');
    const alpha = await harness.actor('u-alpha');

    const first = await harness.tickets.createExternalTicket(integration, {
      externalEventNo: 'EXT-1001',
      deviceCode: 'DEV-T-001',
      title: 'External alarm raised',
      priority: 'urgent',
    });
    expect(first.deduplicated).toBe(false);
    expect(first.ticket.source).toBe('external');

    const second = await harness.tickets.createExternalTicket(integration, {
      externalEventNo: 'EXT-1001',
      deviceCode: 'DEV-T-001',
      title: 'External alarm raised again',
    });
    expect(second.deduplicated).toBe(true);
    expect(second.ticket.id).toBe(first.ticket.id);

    await expectServiceError(
      () =>
        harness.tickets.createExternalTicket(alpha, {
          externalEventNo: 'EXT-1002',
          deviceCode: 'DEV-T-001',
          title: 'Engineer must not use the integration interface',
        }),
      403,
    );
  });
});

describe('supervisor dashboard', () => {
  it('reports all tickets to a supervisor and only own tickets to an engineer', async () => {
    const supervisor = await harness.actor('u-supervisor');
    const alpha = await harness.actor('u-alpha');
    const beta = await harness.actor('u-beta');

    const supervisorView = await harness.dashboard.getDashboard(supervisor);
    expect(supervisorView.scope).toBe('all');
    expect(supervisorView.counts.total).toBeGreaterThan(0);
    expect(supervisorView.byStatus).toHaveLength(5);
    expect(supervisorView.knowledgePublished).toBeGreaterThanOrEqual(1);

    const engineerView = await harness.dashboard.getDashboard(beta);
    expect(engineerView.scope).toBe('own');
    expect(engineerView.counts.total).toBe(0);

    const alphaView = await harness.dashboard.getDashboard(alpha);
    expect(alphaView.scope).toBe('own');
    expect(alphaView.counts.total).toBeGreaterThan(0);
    expect(actorId(alpha)).toBe('u-alpha');
  });
});

describe('external events through the staff submission route', () => {
  it('treats an external event number as an idempotency key', async () => {
    const supervisor = await harness.actor('u-supervisor');
    const first = await harness.tickets.createTicket(supervisor, {
      title: 'Platform alarm',
      customerId: harness.customerId,
      deviceId: harness.deviceId,
      externalEventNo: 'EVT-DEDUPE-1',
    });
    expect(first.source).toBe('external');
    expect(first.externalEventNo).toBe('EVT-DEDUPE-1');

    const replay = await harness.tickets.createTicket(supervisor, {
      title: 'Platform alarm again',
      customerId: harness.customerId,
      deviceId: harness.deviceId,
      externalEventNo: 'EVT-DEDUPE-1',
    });
    expect(replay.id).toBe(first.id);
  });

  it('refuses an integration account without an external event number', async () => {
    const integration = await harness.actor('u-integration');
    await expectServiceError(
      () =>
        harness.tickets.createTicket(integration, {
          title: 'Unidentified alarm',
          customerId: harness.customerId,
          deviceId: harness.deviceId,
        }),
      403,
    );
  });
});

describe('schedule gating', () => {
  it('stops generation and reminders while the schedule is disabled', async () => {
    const supervisor = await harness.actor('u-supervisor');
    const alpha = await harness.actor('u-alpha');
    const device = await harness.ledger.createDevice(supervisor, {
      code: 'DEV-GATE-001',
      name: 'Gated compressor',
      customerId: harness.customerId,
      engineerId: 'u-alpha',
      nextInspectionDate: '2020-01-01',
    });
    const ticket = await harness.tickets.createTicket(supervisor, {
      title: 'Gated overdue ticket',
      customerId: harness.customerId,
      deviceId: device.id,
    });
    await harness.tickets.acceptTicket(supervisor, ticket.id);
    await harness.tickets.startProcessing(alpha, ticket.id);
    await harness.database.repository('serviceTickets').updateOne({
      filter: { id: ticket.id },
      values: { dueAt: new Date(Date.now() - 86_400_000) },
    });

    let enabled = false;
    const gated = new InspectionService(
      harness.database,
      harness.access,
      new ServiceNotificationService(
        harness.notifications as unknown as NotificationService,
      ),
      harness.tickets,
      { isEnabled: () => Promise.resolve(enabled) },
    );

    const blockedRun = await gated.generateDueInspections(new Date());
    expect(blockedRun.created).toBe(0);
    expect(blockedRun.deviceIds).not.toContain(device.id);
    const blockedReminder = await gated.remindOverdueTickets();
    expect(blockedReminder.reminded).toBe(0);
    expect(blockedReminder.ticketIds).not.toContain(ticket.id);

    enabled = true;
    const liveRun = await gated.generateDueInspections(new Date());
    expect(liveRun.deviceIds).toContain(device.id);
    const liveReminder = await gated.remindOverdueTickets();
    expect(liveReminder.ticketIds).toContain(ticket.id);
  });
});

describe('notification late binding', () => {
  it('delivers once the plugin service is resolvable at send time', async () => {
    const box: { target?: NotificationService } = {};
    const wrapper = new ServiceNotificationService(() => box.target);
    const input = {
      userId: 'u-alpha',
      title: 'Hello',
      body: 'Body',
      idempotencyKey: 'late-bind-1',
      sourceType: 'ticket',
    };
    expect(wrapper.enabled).toBe(false);
    expect(await wrapper.sendInApp(input)).toEqual({
      delivered: false,
      error: 'NOTIFICATION_SERVICE_UNAVAILABLE',
    });

    box.target = harness.notifications as unknown as NotificationService;
    expect(wrapper.enabled).toBe(true);
    const result = await wrapper.sendInApp(input);
    expect(result.delivered).toBe(true);
  });
});

describe('assistant conversation history', () => {
  it('persists an exchange per user and restores it on reload', async () => {
    const alpha = await harness.actor('u-alpha');
    const beta = await harness.actor('u-beta');
    const answer = await harness.knowledge.askAssistant(
      alpha,
      'compressor overheat',
    );
    await harness.knowledge.recordAssistantExchange(alpha, answer, {
      ticketId: 999,
    });

    const restored = await harness.knowledge.listAssistantHistory(alpha, {
      ticketId: 999,
    });
    expect(restored).toHaveLength(1);
    expect(restored[0]?.question).toBe('compressor overheat');
    expect(restored[0]?.modelAvailable).toBe(false);
    expect(restored[0]?.ticketId).toBe(999);

    // Another user never sees the conversation.
    expect(
      await harness.knowledge.listAssistantHistory(beta, { ticketId: 999 }),
    ).toHaveLength(0);
  });
});

describe('integration key administration', () => {
  interface KeyRow {
    id: string;
    name?: string | null;
    prefix?: string | null;
    start?: string | null;
    enabled: boolean;
    referenceId: string;
    createdAt?: Date | string | null;
  }

  async function keyHarness() {
    if (!(await harness.database.builder().hasCollection('apikey'))) {
      await harness.database
        .builder()
        .createCollection('apikey', (collection) => {
          collection.increments('id');
          collection.string('name', { length: 128 });
          collection.string('prefix', { length: 32 });
          collection.string('start', { length: 32 });
          collection.boolean('enabled');
          collection.string('referenceId', { length: 64 });
          collection.datetime('expiresAt');
          collection.datetime('lastRequest');
          collection.datetime('createdAt');
        });
    }
    await harness.database.repository<KeyRow>('apikey').createOne({
      values: {
        name: 'Integration platform',
        start: 'sk_live_abc',
        enabled: true,
        referenceId: 'u-integration',
        createdAt: new Date(),
      },
    });
    const created: { userId: string; name: string }[] = [];
    const removed: string[] = [];
    const keys = {
      create: (input: { userId: string; name: string }) => {
        created.push(input);
        return Promise.resolve({
          key: {
            id: 'k-new',
            name: input.name,
            start: 'sk_new_xyz',
            enabled: true,
            referenceId: input.userId,
            createdAt: new Date(),
          },
          secret: 'sk_new_secret',
        });
      },
      remove: (id: string) => {
        removed.push(id);
        return Promise.resolve(undefined);
      },
    };
    const users = {
      list: (query: { userIds: string[] }) =>
        Promise.resolve({
          items: query.userIds.map((id) => ({
            id,
            name:
              id === 'u-integration' ? 'Platform integration' : 'Supervisor',
          })),
        }),
      get: (id: string) => Promise.resolve({ id, name: id, disabledAt: null }),
    };
    const service = new IntegrationKeyService(
      harness.database,
      harness.access,
      {} as never,
      users as never,
      keys as never,
    );
    return { service, created, removed };
  }

  it('lets a supervisor issue a key for the integration account', async () => {
    const { service, created } = await keyHarness();
    const supervisor = await harness.actor('u-supervisor');
    const targets = await service.listTargets(supervisor);
    expect(targets.map((target) => target.id)).toContain('u-integration');

    const issued = await service.createKey(supervisor, {
      userId: 'u-integration',
      name: 'Device platform',
    });
    expect(issued.secret).toBe('sk_new_secret');
    expect(issued.key.userId).toBe('u-integration');
    expect(created).toContainEqual({
      userId: 'u-integration',
      name: 'Device platform',
      expiresIn: null,
    });
  });

  it('keeps a non-supervisor to its own keys', async () => {
    const { service } = await keyHarness();
    const integration = await harness.actor('u-integration');

    expect((await service.listKeys(integration)).length).toBeGreaterThanOrEqual(
      1,
    );
    await expectServiceError(
      () =>
        service.createKey(integration, {
          userId: 'u-supervisor',
          name: 'Escalation',
        }),
      403,
    );
    await expectServiceError(() => service.listTargets(integration), 403);
  });
});
