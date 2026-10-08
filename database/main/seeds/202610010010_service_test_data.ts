import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { hashPassword } from 'better-auth/crypto';
import { randomUUID } from 'node:crypto';
import { createServicePermissionSets } from '../../../server/service-authorization.js';
import { coerceText } from '../../../server/service/scalars.js';

/**
 * Initial service-team permission sets, demonstration accounts, and the
 * example business data the delivered system opens with.
 *
 * Demo data: the accounts below exist so the delivered pages, permissions and
 * tests can be tried immediately. They are development seed data and must not
 * survive into a production installation unchanged.
 */
const DEMO_PASSWORD = 'Service@2026';

interface DemoUser {
  readonly email: string;
  readonly name: string;
  readonly username: string;
  readonly permissionSet: string;
}

const DEMO_USERS: readonly DemoUser[] = [
  {
    email: 'supervisor@example.com',
    name: 'Wu Supervisor',
    username: 'svc.supervisor',
    permissionSet: 'service-supervisor',
  },
  {
    email: 'engineer.a@example.com',
    name: 'Li Engineer A',
    username: 'svc.engineer.a',
    permissionSet: 'service-engineer',
  },
  {
    email: 'engineer.b@example.com',
    name: 'Chen Engineer B',
    username: 'svc.engineer.b',
    permissionSet: 'service-engineer',
  },
  {
    email: 'observer@example.com',
    name: 'Zhao Observer',
    username: 'svc.observer',
    permissionSet: 'service-observer',
  },
  {
    email: 'integration@example.com',
    name: 'Device Platform Integration',
    username: 'svc.integration',
    permissionSet: 'service-integration',
  },
];

function shanghaiToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export default defineSeed({
  name: '202610010010_service_test_data',
  transaction: true,
  async run(context) {
    const { query } = context;
    const now = new Date();

    // --- Permission sets (editable business configuration) -----------------
    // Re-running the seed re-aligns the stored grants with the code definition,
    // so a grant added to a set reaches an installation that was seeded before.
    for (const set of createServicePermissionSets()) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', set.key)
        .executeTakeFirst();
      const values = {
        title: encodeAuthorizationTitle(set.title),
        grants: JSON.stringify(set.grants),
        updatedAt: now,
      };
      if (existing) {
        await query
          .updateTable('authorizationPermissionSets')
          .set(values)
          .where('key', '=', set.key)
          .execute();
        continue;
      }
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: set.key,
          key: set.key,
          createdAt: now,
          ...values,
        })
        .execute();
    }

    // --- Demonstration accounts -------------------------------------------
    const userIds = new Map<string, string>();
    for (const demo of DEMO_USERS) {
      const existing = await query
        .selectFrom('user')
        .select('id')
        .where('email', '=', demo.email)
        .executeTakeFirst();
      if (existing) {
        userIds.set(demo.email, String(existing.id));
        continue;
      }
      const id = randomUUID();
      await query
        .insertInto('user')
        .values({
          id,
          name: demo.name,
          username: demo.username,
          email: demo.email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: randomUUID(),
          accountId: id,
          providerId: 'credential',
          userId: id,
          password: await hashPassword(DEMO_PASSWORD),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      userIds.set(demo.email, id);
    }

    // --- Assign each account its job permission set ------------------------
    for (const demo of DEMO_USERS) {
      const userId = userIds.get(demo.email);
      if (!userId) {
        continue;
      }
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('subjectType', '=', 'user')
        .where('subjectId', '=', userId)
        .where('permissionSetKey', '=', demo.permissionSet)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: randomUUID(),
          permissionSetKey: demo.permissionSet,
          subjectType: 'user',
          subjectId: userId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    // --- Example business data (created once) ------------------------------
    const existingCustomer = (
      await context.repository('customers').findMany({ limit: 1 })
    ).length;
    if (existingCustomer > 0) {
      return;
    }

    const supervisorId = userIds.get('supervisor@example.com') ?? null;
    const engineerAId = userIds.get('engineer.a@example.com') ?? null;
    const engineerBId = userIds.get('engineer.b@example.com') ?? null;
    const integrationId = userIds.get('integration@example.com') ?? null;

    const customerNames: readonly [string, string, string, string][] = [
      [
        'Shanghai Jingmi Precision',
        'Wang Lei',
        '13800000001',
        'Pudong, Shanghai',
      ],
      [
        'Suzhou Hengda Electronics',
        'Liu Min',
        '13800000002',
        'Suzhou, Jiangsu',
      ],
      [
        'Hangzhou Ruixin Pharma',
        'Sun Jie',
        '13800000003',
        'Binjiang, Hangzhou',
      ],
    ];
    const customers: { id: number; name: string }[] = [];
    for (const [name, contactName, phone, address] of customerNames) {
      const { record } = await context.repository('customers').createOne({
        values: {
          name,
          contactName,
          phone,
          address,
          note: null,
          createdAt: now,
          updatedAt: now,
        },
      });
      customers.push({ id: Number(record.id), name: coerceText(record.name) });
    }

    const deviceSpecs: readonly [
      string,
      string,
      string,
      number,
      string | null,
    ][] = [
      ['JMP-CNC-001', 'CNC Milling Center', 'JMP-V5', 0, engineerAId],
      ['JMP-CNC-002', 'CNC Lathe', 'JMP-L3', 0, engineerAId],
      ['HDE-AOI-101', 'AOI Inspection Station', 'HDE-A9', 1, engineerBId],
      ['HDE-WLD-102', 'Laser Welder', 'HDE-W2', 1, engineerBId],
      ['HRX-FIL-201', 'Filling Machine', 'HRX-F7', 2, engineerAId],
      ['HRX-PKG-202', 'Packaging Line', 'HRX-P2', 2, null],
    ];
    const devices: { id: number; serial: string }[] = [];
    for (const [
      serial,
      name,
      model,
      customerIndex,
      engineerId,
    ] of deviceSpecs) {
      const { record } = await context.repository('devices').createOne({
        values: {
          serial,
          name,
          model,
          customerId: customers[customerIndex].id,
          engineerId,
          enabled: true,
          nextInspectionAt: new Date(now.getTime() + 14 * 86400000),
          createdAt: now,
          updatedAt: now,
        },
      });
      devices.push({
        id: Number(record.id),
        serial: coerceText(record.serial),
      });
    }

    const today = shanghaiToday(now);
    const ticketSpecs: readonly {
      title: string;
      problem: string;
      status: string;
      priority: string;
      deviceIndex: number;
      ownerId: string | null;
      confidential?: boolean;
      source?: string;
      externalEventNo?: string | null;
      resolutionNote?: string | null;
      result?: string | null;
      /** Seed data must exercise the overdue path, including a closed one. */
      overdue?: boolean;
    }[] = [
      {
        title: 'Spindle overheating after two hours',
        problem: 'Spindle temperature alarm triggers after continuous running.',
        status: 'pendingAcceptance',
        priority: 'high',
        deviceIndex: 0,
        ownerId: null,
      },
      {
        title: 'Lathe turret fails to index',
        problem:
          'Turret stops between stations and reports a positioning fault.',
        status: 'pending',
        priority: 'normal',
        deviceIndex: 1,
        ownerId: engineerAId,
        overdue: true,
      },
      {
        title: 'AOI camera calibration drift',
        problem: 'False defects reported on the left board edge.',
        status: 'processing',
        priority: 'urgent',
        deviceIndex: 2,
        ownerId: engineerBId,
      },
      {
        title: 'Welder power fluctuation',
        problem: 'Power drops during the seam, leaving an incomplete weld.',
        status: 'pendingConfirmation',
        priority: 'high',
        deviceIndex: 3,
        ownerId: engineerBId,
        result: 'Replaced the regulator and re-tested ten seams.',
        resolutionNote: 'Awaiting customer sign-off on the trial batch.',
      },
      {
        title: 'Filling nozzle leakage',
        problem: 'Small leakage at the nozzle joint during filling.',
        status: 'closed',
        priority: 'normal',
        deviceIndex: 4,
        ownerId: engineerAId,
        result: 'Tightened the joint and replaced the seal.',
        resolutionNote: 'Verified leak-free over a full shift.',
        // A closed ticket that is past due must not generate a reminder.
        overdue: true,
      },
      {
        title: 'Platform-reported packaging jam',
        problem:
          'Submitted from the device platform; conveyor jams at the transfer point.',
        status: 'pendingAcceptance',
        priority: 'high',
        deviceIndex: 5,
        ownerId: null,
        confidential: true,
        source: 'platform',
        externalEventNo: 'PLT-2026-000123',
      },
    ];

    for (let index = 0; index < ticketSpecs.length; index += 1) {
      const spec = ticketSpecs[index];
      const device = devices[spec.deviceIndex];
      const customer = customers[deviceSpecs[spec.deviceIndex][3]];
      await context.repository('tickets').createOne({
        values: {
          ticketNo: `SR-${today.replace(/-/g, '')}-${String(index + 1).padStart(4, '0')}`,
          title: spec.title,
          customerId: customer.id,
          deviceId: device.id,
          problem: spec.problem,
          priority: spec.priority,
          dueAt: new Date(
            now.getTime() + (spec.overdue ? -2 : index + 1) * 86400000,
          ),
          ownerId: spec.ownerId,
          confidential: spec.confidential ?? false,
          // A confidential ticket is never offered to read-only observers, so
          // the two flags cannot both be true.
          observerVisible: !spec.confidential,
          status: spec.status,
          result: spec.result ?? null,
          resolutionNote: spec.resolutionNote ?? null,
          rejectReason: null,
          acceptedAt:
            spec.status === 'pendingAcceptance'
              ? null
              : new Date(now.getTime() - 86400000),
          closedAt:
            spec.status === 'closed' ? new Date(now.getTime() - 3600000) : null,
          externalEventNo: spec.externalEventNo ?? null,
          source: spec.source ?? 'manual',
          createdById:
            spec.source === 'platform' ? integrationId : supervisorId,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    await context.repository('inspections').createOne({
      values: {
        deviceId: devices[0].id,
        plannedDate: today,
        ownerId: engineerAId ?? '',
        status: 'pending',
        result: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    const articles: readonly [string, string, string, boolean][] = [
      [
        'Spindle over-temperature checklist',
        'How to triage a spindle temperature alarm before calling the OEM.',
        '1. Record the actual spindle temperature and the alarm code.\n2. Check the cooling unit flow and filter.\n3. Verify the lubrication cycle.\n4. If the alarm persists above the threshold, stop the machine and raise a service ticket.',
        true,
      ],
      [
        'AOI false-defect tuning notes (draft)',
        'Draft guidance for camera calibration drift.',
        'Draft: compare the reference board, then re-run the calibration pattern. Not yet reviewed by the quality team.',
        false,
      ],
    ];
    for (const [title, summary, body, published] of articles) {
      await context.repository('knowledge_articles').createOne({
        values: {
          title,
          summary,
          body,
          published,
          createdById: supervisorId,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    const unconfigured =
      'AI knowledge base is not configured yet: no vector database or embedding model is available, so this manual is stored but not searchable by the assistant.';
    const manuals: readonly [string, string, string][] = [
      [
        'JMP-V5 CNC Milling Center — Service Manual',
        'JMP-V5',
        'Installation, daily maintenance, spindle care and alarm-code table for the JMP-V5 milling center.',
      ],
      [
        'HDE-A9 AOI Station — Service Manual',
        'HDE-A9',
        'Optical calibration, lighting maintenance and conveyor adjustment for the HDE-A9 inspection station.',
      ],
    ];
    for (const [title, model, body] of manuals) {
      await context.repository('manuals').createOne({
        values: {
          title,
          model,
          summary: body.slice(0, 200),
          body,
          status: 'unconfigured',
          statusMessage: unconfigured,
          knowledgeBaseKey: null,
          fileId: null,
          createdById: supervisorId,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  },
});
