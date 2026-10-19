import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { UserManagementService } from '@nocobase/app-plugin-users/server';
import type { DatabaseManager } from '@nocobase/db';

import type {
  ItTicketActivityRecord,
  ItTicketRecord,
} from '../services/it-ticket-service.js';

const PASSWORD = 'Demo123456!';

const PEOPLE = {
  serviceDesk: {
    name: '张伟 / Zhang Wei',
    username: 'itdemo_service',
    email: 'service@it-demo.example.com',
    permissionSet: 'it-service-desk',
  },
  engineer1: {
    name: '李娜 / Li Na',
    username: 'itdemo_engineer1',
    email: 'engineer1@it-demo.example.com',
    permissionSet: 'it-engineer',
  },
  engineer2: {
    name: '王强 / Wang Qiang',
    username: 'itdemo_engineer2',
    email: 'engineer2@it-demo.example.com',
    permissionSet: 'it-engineer',
  },
  employee: {
    name: '陈晨 / Chen Chen',
    username: 'itdemo_employee',
    email: 'employee@it-demo.example.com',
    permissionSet: 'it-employee',
  },
} as const;

type PersonKey = keyof typeof PEOPLE;

interface SampleContext {
  readonly database: DatabaseManager;
  readonly authz: AppAuthorization;
  readonly userManagement: UserManagementService;
}

async function ensurePeople(
  context: SampleContext,
): Promise<Record<PersonKey, string>> {
  const ids = {} as Record<PersonKey, string>;
  for (const key of Object.keys(PEOPLE) as PersonKey[]) {
    const person = PEOPLE[key];
    const found = await context.userManagement.list({
      page: 1,
      pageSize: 10,
      search: person.email,
    });
    let userId = found.items.find(
      (item) => item.email.toLowerCase() === person.email.toLowerCase(),
    )?.id;
    if (!userId) {
      const created = await context.userManagement.create({
        name: person.name,
        username: person.username,
        email: person.email,
        password: PASSWORD,
      });
      userId = created.id;
    }
    ids[key] = userId;

    const assignments = await context.authz.permissionSets.listAssignments(
      person.permissionSet,
    );
    if (
      !assignments.some(
        (assignment) =>
          assignment.subject.type === 'user' &&
          assignment.subject.id === userId,
      )
    ) {
      await context.authz.permissionSets.assign({
        subject: { type: 'user', id: userId },
        permissionSet: person.permissionSet,
      });
    }
  }
  return ids;
}

function at(hoursAgo: number): Date {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
}

async function createTicket(
  context: SampleContext,
  input: {
    title: string;
    description: string;
    urgency: string;
    status: string;
    requesterId: string;
    assigneeId?: string;
    resolution?: string;
    createdAt: Date;
    statusChangedAt: Date;
    assignedAt?: Date;
    resolvedAt?: Date;
    closedAt?: Date;
  },
  activities: readonly Omit<ItTicketActivityRecord, 'id' | 'ticketId'>[],
): Promise<ItTicketRecord | undefined> {
  const repo = context.database.repository<ItTicketRecord>('itTickets');
  const existing = await repo.findOne({
    filter: (f) => f.string('title').eq(input.title),
  });
  if (existing) return existing;

  return context.database.transaction(async (connection) => {
    const created = await connection
      .repository<ItTicketRecord>('itTickets')
      .createOne({
        values: {
          ...input,
          assigneeId: input.assigneeId ?? null,
          resolution: input.resolution ?? null,
          assignedAt: input.assignedAt ?? null,
          resolvedAt: input.resolvedAt ?? null,
          closedAt: input.closedAt ?? null,
          returnedAt: null,
          overdueNotifiedAt: null,
          updatedAt: input.statusChangedAt,
        },
      });
    for (const activity of activities) {
      await connection
        .repository<ItTicketActivityRecord>('itTicketActivities')
        .createOne({
          values: { ...activity, ticketId: created.record.id },
        });
    }
    return created.record;
  });
}

/**
 * Demonstrates every role and every ticket state. Demo records are titled
 * `[Demo]` and are never created twice.
 */
export async function seedItTicketSampleData(
  context: SampleContext,
): Promise<void> {
  const people = await ensurePeople(context);
  const hour = 60 * 60 * 1000;

  await createTicket(
    context,
    {
      title: '[Demo] 办公室打印机无法连接 / Office printer offline',
      description:
        '三楼打印机显示离线，重启后仍然无法打印。 / The third-floor printer shows offline and still will not print after a restart.',
      urgency: 'high',
      status: 'pending',
      requesterId: people.employee,
      createdAt: at(2),
      statusChangedAt: at(2),
    },
    [
      {
        authorId: people.employee,
        type: 'created',
        content: null,
        fromStatus: null,
        toStatus: 'pending',
        createdAt: at(2),
      },
    ],
  );

  await createTicket(
    context,
    {
      title: '[Demo] 新同事电脑无法登录 / New colleague cannot sign in',
      description:
        '新同事的账号提示密码错误，无法登录域账号。 / A new colleague gets a password error when signing in.',
      urgency: 'critical',
      status: 'in_progress',
      requesterId: people.employee,
      assigneeId: people.engineer1,
      createdAt: new Date(Date.now() - 26 * hour),
      statusChangedAt: new Date(Date.now() - 20 * hour),
      assignedAt: new Date(Date.now() - 20 * hour),
    },
    [
      {
        authorId: people.employee,
        type: 'created',
        content: null,
        fromStatus: null,
        toStatus: 'pending',
        createdAt: new Date(Date.now() - 26 * hour),
      },
      {
        authorId: people.serviceDesk,
        type: 'assigned',
        content: people.engineer1,
        fromStatus: 'pending',
        toStatus: 'in_progress',
        createdAt: new Date(Date.now() - 20 * hour),
      },
      {
        authorId: people.engineer1,
        type: 'progress',
        content:
          '已重置域账号密码，正在等待用户确认。 / The domain password is reset; waiting for the user to confirm.',
        fromStatus: 'in_progress',
        toStatus: 'in_progress',
        createdAt: at(1),
      },
    ],
  );

  await createTicket(
    context,
    {
      title: '[Demo] 显示器闪烁 / Monitor flickering',
      description:
        '外接显示器每隔几分钟闪一下。 / The external monitor flickers every few minutes.',
      urgency: 'medium',
      status: 'resolved',
      requesterId: people.employee,
      assigneeId: people.engineer2,
      resolution:
        '更换了 DisplayPort 线缆并更新显卡驱动，观察后不再闪烁。 / Replaced the DisplayPort cable and updated the graphics driver.',
      createdAt: at(48),
      statusChangedAt: at(3),
      assignedAt: at(47),
      resolvedAt: at(3),
    },
    [
      {
        authorId: people.employee,
        type: 'created',
        content: null,
        fromStatus: null,
        toStatus: 'pending',
        createdAt: at(48),
      },
      {
        authorId: people.serviceDesk,
        type: 'assigned',
        content: people.engineer2,
        fromStatus: 'pending',
        toStatus: 'in_progress',
        createdAt: at(47),
      },
      {
        authorId: people.engineer2,
        type: 'resolved',
        content:
          '更换了 DisplayPort 线缆并更新显卡驱动，观察后不再闪烁。 / Replaced the DisplayPort cable and updated the graphics driver.',
        fromStatus: 'in_progress',
        toStatus: 'resolved',
        createdAt: at(3),
      },
    ],
  );

  await createTicket(
    context,
    {
      title: '[Demo] 申请安装设计软件 / Design software install',
      description:
        '需要在新电脑上安装 Figma 桌面版。 / Need the Figma desktop app installed on a new computer.',
      urgency: 'low',
      status: 'closed',
      requesterId: people.employee,
      assigneeId: people.engineer1,
      resolution: '已安装并完成登录测试。 / Installed and verified sign-in.',
      createdAt: at(120),
      statusChangedAt: at(96),
      assignedAt: at(119),
      resolvedAt: at(100),
      closedAt: at(96),
    },
    [
      {
        authorId: people.employee,
        type: 'created',
        content: null,
        fromStatus: null,
        toStatus: 'pending',
        createdAt: at(120),
      },
      {
        authorId: people.serviceDesk,
        type: 'assigned',
        content: people.engineer1,
        fromStatus: 'pending',
        toStatus: 'in_progress',
        createdAt: at(119),
      },
      {
        authorId: people.engineer1,
        type: 'resolved',
        content: '已安装并完成登录测试。 / Installed and verified sign-in.',
        fromStatus: 'in_progress',
        toStatus: 'resolved',
        createdAt: at(100),
      },
      {
        authorId: people.employee,
        type: 'closed',
        content: null,
        fromStatus: 'resolved',
        toStatus: 'closed',
        createdAt: at(96),
      },
    ],
  );
}
