import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { UserAdministrationService } from '@nocobase/app-plugin-authentication/server';
import type { DatabaseManager } from '@nocobase/db';
import {
  ROLE_KEYS,
  TICKET_STATUS,
  type BusinessRole,
  type CustomerRow,
  type DeviceRow,
  type ExecutionLogRow,
  type InspectionRow,
  type KnowledgeArticleRow,
  type TicketRow,
  type TicketShareRow,
} from './contracts.js';

const DEMO_PASSWORD = 'Service@12345';

interface DemoUser {
  key: string;
  username: string;
  name: string;
  email: string;
  role: BusinessRole | null;
}

const DEMO_USERS: readonly DemoUser[] = [
  {
    key: 'supervisor',
    username: 'service.supervisor',
    name: 'Service Supervisor',
    email: 'service.supervisor@example.com',
    role: 'supervisor',
  },
  {
    key: 'engineerAlpha',
    username: 'service.engineer.alpha',
    name: 'Engineer Alpha',
    email: 'service.engineer.alpha@example.com',
    role: 'engineer',
  },
  {
    key: 'engineerBeta',
    username: 'service.engineer.beta',
    name: 'Engineer Beta',
    email: 'service.engineer.beta@example.com',
    role: 'engineer',
  },
  {
    key: 'observer',
    username: 'service.observer',
    name: 'Read-only Observer',
    email: 'service.observer@example.com',
    role: 'observer',
  },
  {
    key: 'integration',
    username: 'service.integration',
    name: 'Device Platform Integration',
    email: 'service.integration@example.com',
    role: 'integration',
  },
];

const ALL_STAFF_PAGES = [
  'service.dashboard',
  'service.tickets',
  'service.customers',
  'service.devices',
  'service.inspections',
  'service.knowledge',
  'service.assistant',
] as const;

const ROLE_PAGE_GRANTS: Record<BusinessRole, readonly string[]> = {
  supervisor: [...ALL_STAFF_PAGES, 'api-keys'],
  engineer: [...ALL_STAFF_PAGES],
  observer: ['service.tickets'],
  // The integration account is a machine identity: it has no business pages,
  // but it must be able to manage its own API key in Settings.
  integration: ['api-keys'],
};

const ROLE_TITLES: Record<BusinessRole, string> = {
  supervisor: 'Service Supervisor',
  engineer: 'Service Engineer',
  observer: 'Read-only Observer',
  integration: 'Device Platform Integration',
};

export interface SampleTicketSeed {
  code: string;
  title: string;
  description: string;
  deviceIndex: number;
  priority: string;
  confidential: boolean;
  status: string;
  assigneeId: string | null;
  createdAt: Date;
  dueAt?: Date;
  accepted?: boolean;
  processNote?: string;
  resultNote?: string;
  closedAt?: Date;
  confirmationNote?: string;
}

export interface ProvisionReport {
  usersCreated: string[];
  usersExisting: string[];
  userIds: Record<string, string>;
  permissionSets: string[];
  sampleDataCreated: boolean;
  customers: number;
  devices: number;
  tickets: number;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 3600 * 1000);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Installs the application's business roles, demo accounts and sample records.
 *
 * Everything is keyed on a stable business value — username, Permission Set key
 * or ticket code — so running it on every start neither duplicates nor
 * overwrites work an administrator has done since.
 */
export class ServiceBootstrap {
  private readonly db: DatabaseManager;
  private readonly authz: AppAuthorization;
  private readonly users: UserAdministrationService;
  private readonly enableSampleData: boolean;

  constructor(options: {
    db: DatabaseManager;
    authz: AppAuthorization;
    users: UserAdministrationService;
    enableSampleData: boolean;
  }) {
    this.db = options.db;
    this.authz = options.authz;
    this.users = options.users;
    this.enableSampleData = options.enableSampleData;
  }

  async run(): Promise<ProvisionReport> {
    const usersCreated: string[] = [];
    const usersExisting: string[] = [];
    const userIds: Record<string, string> = {};

    const existing = await this.users.list({ pageSize: 200 });
    for (const demo of DEMO_USERS) {
      const match = existing.items.find(
        (item) => item.username === demo.username || item.email === demo.email,
      );
      if (match) {
        usersExisting.push(match.id);
        userIds[demo.key] = match.id;
      } else {
        const created = await this.users.create({
          name: demo.name,
          username: demo.username,
          email: demo.email,
          password: DEMO_PASSWORD,
        });
        usersCreated.push(created.id);
        userIds[demo.key] = created.id;
      }
    }

    const permissionSets = await this.ensurePermissionSets();
    await this.ensureAssignments(userIds);

    let sampleDataCreated = false;
    let customers = 0;
    let devices = 0;
    let tickets = 0;
    // Sample data needs the service tables. A runtime that boots before its
    // migrations have run (or without a connection at all) still gets its
    // accounts and roles, and the sample records appear on the next start.
    if (this.enableSampleData && (await this.collectionsReady())) {
      const result = await this.ensureSampleData(userIds);
      sampleDataCreated = result.created;
      customers = result.customers;
      devices = result.devices;
      tickets = result.tickets;
    }

    return {
      usersCreated,
      usersExisting,
      userIds,
      permissionSets,
      sampleDataCreated,
      customers,
      devices,
      tickets,
    };
  }

  /** True when the service tables this bootstrap writes to are present. */
  private async collectionsReady(): Promise<boolean> {
    try {
      return await this.db.builder().hasCollection('serviceCustomers');
    } catch {
      return false;
    }
  }

  private async ensurePermissionSets(): Promise<string[]> {
    const keys: string[] = [];
    for (const demo of DEMO_USERS) {
      if (!demo.role) {
        continue;
      }
      const key = ROLE_KEYS[demo.role];
      keys.push(key);
      const grants = ROLE_PAGE_GRANTS[demo.role].map((page) =>
        this.authz.pages.grant(page),
      );
      const existing = await this.authz.permissionSets.get(key);
      if (existing) {
        // Keep the code-owned page grants in sync while leaving data rules an
        // administrator added alone.
        await this.authz.permissionSets.update(key, {
          key,
          title: ROLE_TITLES[demo.role],
          grants,
        });
      } else {
        await this.authz.permissionSets.create({
          key,
          title: ROLE_TITLES[demo.role],
          grants,
        });
      }
    }
    return [...new Set(keys)];
  }

  private async ensureAssignments(
    userIds: Record<string, string>,
  ): Promise<void> {
    const assignments = await this.authz.permissionSets.listAssignments();
    for (const demo of DEMO_USERS) {
      if (!demo.role) {
        continue;
      }
      const userId = userIds[demo.key];
      const key = ROLE_KEYS[demo.role];
      const exists = assignments.some(
        (assignment) =>
          assignment.permissionSet === key && assignment.subject.id === userId,
      );
      if (!exists) {
        await this.authz.permissionSets.assign({
          subject: { type: 'user', id: userId },
          permissionSet: key,
        });
      }
    }
  }

  private async ensureSampleData(userIds: Record<string, string>): Promise<{
    created: boolean;
    customers: number;
    devices: number;
    tickets: number;
  }> {
    const supervisorId = userIds.supervisor;
    const alphaId = userIds.engineerAlpha;
    const betaId = userIds.engineerBeta;
    const now = new Date();
    const today = isoDate(now);

    const customerRepo = this.db.repository<CustomerRow>('serviceCustomers');
    const deviceRepo = this.db.repository<DeviceRow>('serviceDevices');
    const ticketRepo = this.db.repository<TicketRow>('serviceTickets');

    let created = false;

    const customerSeeds = [
      {
        name: 'Xinghe Technology Park',
        contactName: 'Director Wang',
        contactPhone: '010-5550-1001',
        address: 'Haidian District, Beijing',
      },
      {
        name: 'Blue Ocean Precision Manufacturing',
        contactName: 'Engineer Li',
        contactPhone: '021-5550-2202',
        address: 'Pudong New Area, Shanghai',
      },
      {
        name: 'Yunqi Data Center',
        contactName: 'Engineer Zhao',
        contactPhone: '0755-5550-3303',
        address: 'Nanshan District, Shenzhen',
      },
    ];
    const customerIds: number[] = [];
    for (const seed of customerSeeds) {
      const existing = await customerRepo.findOne({
        filter: { name: seed.name },
      });
      if (existing) {
        customerIds.push(existing.id);
        continue;
      }
      const { record } = await customerRepo.createOne({
        values: { ...seed, note: null, createdAt: now, updatedAt: now },
      });
      customerIds.push(record.id);
      created = true;
    }

    const deviceSeeds = [
      {
        code: 'DEV-AQ-001',
        name: 'AquaPure X200 (Lobby)',
        model: 'AQ-X200',
        serialNo: 'AQX200-0001',
        customerIndex: 0,
        engineerId: alphaId,
        nextInspectionDate: today,
      },
      {
        code: 'DEV-AQ-002',
        name: 'AquaPure X200 (Canteen)',
        model: 'AQ-X200',
        serialNo: 'AQX200-0002',
        customerIndex: 0,
        engineerId: alphaId,
        nextInspectionDate: isoDate(addDays(now, 30)),
      },
      {
        code: 'DEV-TM-101',
        name: 'ThermalMaster T9 (Line A)',
        model: 'TM-T9',
        serialNo: 'TMT9-0101',
        customerIndex: 1,
        engineerId: betaId,
        nextInspectionDate: isoDate(addDays(now, 14)),
      },
      {
        code: 'DEV-TM-102',
        name: 'ThermalMaster T9 (Line B)',
        model: 'TM-T9',
        serialNo: 'TMT9-0102',
        customerIndex: 1,
        engineerId: betaId,
        nextInspectionDate: isoDate(addDays(now, 45)),
      },
      {
        code: 'DEV-AQ-003',
        name: 'AquaPure X200 (Server Room)',
        model: 'AQ-X200',
        serialNo: 'AQX200-0003',
        customerIndex: 2,
        engineerId: alphaId,
        nextInspectionDate: isoDate(addDays(now, -1)),
      },
      {
        code: 'DEV-TM-103',
        name: 'ThermalMaster T9 (Chiller Room)',
        model: 'TM-T9',
        serialNo: 'TMT9-0103',
        customerIndex: 2,
        engineerId: betaId,
        nextInspectionDate: isoDate(addDays(now, 7)),
      },
    ];
    const deviceIds: number[] = [];
    for (const seed of deviceSeeds) {
      const existing = await deviceRepo.findOne({
        filter: { code: seed.code },
      });
      if (existing) {
        deviceIds.push(existing.id);
        continue;
      }
      const { record } = await deviceRepo.createOne({
        values: {
          code: seed.code,
          name: seed.name,
          model: seed.model,
          serialNo: seed.serialNo,
          customerId: customerIds[seed.customerIndex],
          engineerId: seed.engineerId ?? null,
          enabled: true,
          nextInspectionDate: seed.nextInspectionDate,
          lastInspectionDate: null,
          createdAt: now,
          updatedAt: now,
        },
      });
      deviceIds.push(record.id);
      created = true;
    }

    const ticketSeeds: SampleTicketSeed[] = [
      {
        code: 'TK-20260901-0001',
        title: 'Lobby water purifier leaking at the base',
        description:
          'Staff reported water pooling under the unit. Urgent, needs acceptance.',
        deviceIndex: 0,
        priority: 'urgent',
        confidential: false,
        status: TICKET_STATUS.pendingAcceptance,
        assigneeId: null,
        createdAt: addDays(now, -0.2),
      },
      {
        code: 'TK-20260901-0002',
        title: 'Canteen purifier showing E03 low pressure alarm',
        description: 'Alarm appears twice a day and clears after a restart.',
        deviceIndex: 1,
        priority: 'normal',
        confidential: false,
        status: TICKET_STATUS.pendingAcceptance,
        assigneeId: null,
        createdAt: addDays(now, -0.5),
      },
      {
        code: 'TK-20260901-0003',
        title: 'ThermalMaster T9 on Line A tripping E10 over temperature',
        description: 'High-temperature alarm recorded during the night shift.',
        deviceIndex: 2,
        priority: 'urgent',
        confidential: false,
        status: TICKET_STATUS.pendingProcessing,
        assigneeId: betaId,
        createdAt: addDays(now, -2),
        dueAt: addDays(now, -1),
        accepted: true,
      },
      {
        code: 'TK-20260901-0004',
        title: 'Line B chiller noisy circulation pump',
        description:
          'Pump noise increased over the last week, flow still normal.',
        deviceIndex: 3,
        priority: 'normal',
        confidential: false,
        status: TICKET_STATUS.processing,
        assigneeId: betaId,
        createdAt: addDays(now, -3),
        dueAt: addDays(now, 1),
        accepted: true,
        processNote:
          'Isolated the pump and ordered a replacement mechanical seal.',
      },
      {
        code: 'TK-20260901-0005',
        title: 'Server room purifier internal quality complaint',
        description:
          'Customer raised a confidential complaint about repeated filter failures.',
        deviceIndex: 4,
        priority: 'normal',
        confidential: true,
        status: TICKET_STATUS.pendingProcessing,
        assigneeId: alphaId,
        createdAt: addDays(now, -4),
        dueAt: addDays(now, 2),
        accepted: true,
      },
      {
        code: 'TK-20260901-0006',
        title: 'Canteen unit filter replacement completed',
        description: 'Routine filter replacement.',
        deviceIndex: 1,
        priority: 'normal',
        confidential: false,
        status: TICKET_STATUS.closed,
        assigneeId: alphaId,
        createdAt: addDays(now, -10),
        dueAt: addDays(now, -7),
        accepted: true,
        resultNote:
          'Replaced the first-stage cartridge and flushed for five minutes. TDS now 32 ppm.',
        closedAt: addDays(now, -6),
        confirmationNote: 'Confirmed with the customer contact.',
      },
    ];

    for (const seed of ticketSeeds) {
      const existing = await ticketRepo.findOne({
        filter: { code: seed.code },
      });
      if (existing) {
        continue;
      }
      const deviceId = deviceIds[seed.deviceIndex];
      const device = deviceSeeds[seed.deviceIndex];
      const acceptedAt = seed.accepted ? addDays(seed.createdAt, 0.2) : null;
      const dueAt = seed.dueAt ?? null;
      const { record } = await ticketRepo.createOne({
        values: {
          code: seed.code,
          title: seed.title,
          description: seed.description,
          customerId: customerIds[device.customerIndex],
          deviceId,
          priority: seed.priority,
          confidential: seed.confidential,
          status: seed.status,
          assigneeId: seed.assigneeId ?? null,
          createdById: supervisorId,
          source: 'internal',
          externalEventNo: null,
          dueAt,
          acceptedAt,
          acceptedById: seed.accepted ? supervisorId : null,
          acceptNote: seed.accepted
            ? 'Accepted and assigned by the service supervisor.'
            : null,
          processNote: seed.processNote ?? null,
          resultNote: seed.resultNote ?? null,
          rejectReason: null,
          confirmationNote: seed.confirmationNote ?? null,
          closedAt: seed.closedAt ?? null,
          createdAt: seed.createdAt,
          updatedAt: seed.closedAt ?? seed.createdAt,
        },
      });
      await this.db
        .repository<ExecutionLogRow>('serviceExecutionLogs')
        .createOne({
          values: {
            ticketId: record.id,
            actorId: supervisorId,
            action: 'created',
            detail:
              'Sample ticket provisioned for the application walkthrough.',
            createdAt: seed.createdAt,
          },
        });
      created = true;
    }
    // One inspection due today, deduplicated by device and date.
    const inspectionRepo =
      this.db.repository<InspectionRow>('serviceInspections');
    const inspection = await inspectionRepo.findOne({
      filter: { deviceId: deviceIds[0], inspectionDate: today },
    });
    if (!inspection) {
      await inspectionRepo.createOne({
        values: {
          deviceId: deviceIds[0],
          inspectionDate: today,
          engineerId: alphaId,
          status: 'pending',
          resultNote: null,
          ticketId: null,
          reminderSent: false,
          createdAt: now,
          updatedAt: now,
        },
      });
      created = true;
    }

    const articleRepo = this.db.repository<KnowledgeArticleRow>(
      'serviceKnowledgeArticles',
    );
    const articles = [
      {
        title: 'Handling a low-pressure E03 alarm on AquaPure units',
        body: 'Check the pre-filter, the feed line for kinks, then reset the alarm from the service menu.',
        published: true,
      },
      {
        title: 'Draft: when to escalate a confidential quality complaint',
        body: 'Internal draft describing the escalation path for confidential complaints. Not yet approved.',
        published: false,
      },
    ];
    for (const article of articles) {
      const existing = await articleRepo.findOne({
        filter: { title: article.title },
      });
      if (existing) {
        continue;
      }
      await articleRepo.createOne({
        values: {
          title: article.title,
          body: article.body,
          category: article.published ? 'troubleshooting' : 'process',
          published: article.published,
          authorId: supervisorId,
          createdAt: now,
          updatedAt: now,
        },
      });
      created = true;
    }

    // A read-only collaboration share, for the shared-ticket walkthrough.
    const shareRepo = this.db.repository<TicketShareRow>('serviceTicketShares');
    const sharedTicket = await ticketRepo.findOne({
      filter: { code: 'TK-20260901-0004' },
    });
    if (sharedTicket && alphaId) {
      const existingShare = await shareRepo.findOne({
        filter: { ticketId: sharedTicket.id, engineerId: alphaId },
      });
      if (!existingShare) {
        await shareRepo.createOne({
          values: {
            ticketId: sharedTicket.id,
            engineerId: alphaId,
            expiresAt: addDays(now, 7),
            createdById: supervisorId,
            createdAt: now,
            updatedAt: now,
          },
        });
        created = true;
      }
    }

    return {
      created,
      customers: customerSeeds.length,
      devices: deviceSeeds.length,
      tickets: ticketSeeds.length,
    };
  }
}

export { DEMO_PASSWORD };
