import type { Application } from '@nocobase/app-server/application';
import {
  userAdministrationServiceToken,
  UserAdministrationError,
} from '@nocobase/app-plugin-authentication/server';
import { userRoleScopeRegistryToken } from '@nocobase/app-plugin-users/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { createHelpdeskRoleScope } from '../helpdesk/role-scope.js';
import { HelpdeskService } from '../helpdesk/service.js';
import { helpdeskServiceToken } from '../helpdesk/tokens.js';

const OVERDUE_REMINDER_INTERVAL_MS = 30 * 60 * 1000;

/** Demo accounts the sample tickets refer to. Password is shared for a one-click walkthrough. */
const DEMO_PASSWORD = 'Demo@12345';
const DEMO_USERS = [
  {
    username: 'demo.employee',
    email: 'employee@demo.local',
    name: '张三（员工）',
    role: 'employee',
  },
  {
    username: 'demo.engineer',
    email: 'engineer@demo.local',
    name: '李工（工程师）',
    role: 'engineer',
  },
  {
    username: 'demo.engineer2',
    email: 'engineer2@demo.local',
    name: '王工（工程师）',
    role: 'engineer',
  },
  {
    username: 'demo.servicedesk',
    email: 'servicedesk@demo.local',
    name: '赵服务台',
    role: 'serviceDesk',
  },
] as const;

const HOUR = 60 * 60 * 1000;

export class HelpdeskProvider extends ServiceProvider<Application> {
  public readonly name: string = 'nb3-factory/helpdesk-provider';
  private reminderTimer?: NodeJS.Timeout;
  private releaseRoleScope?: () => void;

  public override register(): void {
    this.app.container.singleton(helpdeskServiceToken, () => {
      return new HelpdeskService(this.app);
    });
  }

  public override async boot(): Promise<void> {
    // Register the IT helpdesk role with the Users plugin's role-scope registry. Doing
    // this in `boot()` is what makes the role assignable from the built-in Users page
    // instead of a page of our own; the Users plugin owns the page and the assignment
    // transaction, this application owns only the role and where it is stored.
    if (
      !this.releaseRoleScope &&
      this.app.container.has(userRoleScopeRegistryToken)
    ) {
      this.releaseRoleScope = this.app.container
        .resolve(userRoleScopeRegistryToken)
        .register(createHelpdeskRoleScope());
    }
    // Sample data is provisioned here rather than in a seed: a seed runs in the
    // database task container, which deliberately refuses the user service, so
    // it cannot create the demo accounts the tickets belong to.
    try {
      await this.ensureDemoData();
    } catch (error) {
      console.warn('[helpdesk] could not provision demo data', error);
    }
  }

  public override async start(): Promise<void> {
    const service = this.app.container.resolve(helpdeskServiceToken);
    const remind = (): void => {
      void service.remindOverdueTickets().catch((error: unknown) => {
        console.warn('[helpdesk] overdue reminder run failed', error);
      });
    };
    // Run once on start so a restart does not wait a whole interval, then poll.
    remind();
    this.reminderTimer = setInterval(remind, OVERDUE_REMINDER_INTERVAL_MS);
    this.reminderTimer.unref?.();
  }

  public override async shutdown(): Promise<void> {
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer);
      this.reminderTimer = undefined;
    }
    this.releaseRoleScope?.();
    this.releaseRoleScope = undefined;
  }

  private async ensureDemoData(): Promise<void> {
    const database = this.app.container.resolve(databaseManagerToken);
    const connection = database.connection('main');

    const profileCount = await connection.query
      .selectFrom<{ count: number | string }>('helpdeskProfiles')
      .select((eb) => [eb.fn.countAll<number>().as('count')])
      .executeTakeFirst();
    if (Number(profileCount?.count ?? 0) > 0) {
      return;
    }

    // Sample data is a requested part of this application, so it is created on
    // every boot that finds no profiles yet, in development and in production
    // alike. The count guard above makes the work idempotent.
    if (!this.app.container.has(userAdministrationServiceToken)) {
      return;
    }

    const users = this.app.container.resolve(userAdministrationServiceToken);
    const ids = new Map<string, string>();
    for (const demo of DEMO_USERS) {
      const id = await this.ensureDemoUser(users, demo);
      ids.set(demo.email, id);
      await connection.query
        .insertInto('helpdeskProfiles')
        .values({
          userId: id,
          role: demo.role,
          displayName: demo.name,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();
    }

    const employee = ids.get('employee@demo.local')!;
    const engineer = ids.get('engineer@demo.local')!;
    const engineer2 = ids.get('engineer2@demo.local')!;
    const serviceDesk = ids.get('servicedesk@demo.local')!;

    const tickets: readonly {
      ticketNo: string;
      title: string;
      description: string;
      urgency: string;
      status: string;
      reporterId: string;
      reporterName: string;
      assigneeId: string | null;
      assigneeName: string | null;
      solution: string | null;
      lastRejectedReason: string | null;
      ageMs: number;
    }[] = [
      {
        ticketNo: 'HD-00001',
        title: '办公区 3 楼无线网络频繁断连',
        description:
          '3 楼办公区无线网络每隔十分钟左右断开一次，重连后才能继续使用，影响视频会议。',
        urgency: 'high',
        status: 'pending',
        reporterId: employee,
        reporterName: '张三（员工）',
        assigneeId: null,
        assigneeName: null,
        solution: null,
        lastRejectedReason: null,
        ageMs: 30 * HOUR,
      },
      {
        ticketNo: 'HD-00002',
        title: '笔记本电脑无法开机',
        description: '按住电源键后指示灯闪烁但屏幕无显示，昨天更新系统后出现。',
        urgency: 'urgent',
        status: 'processing',
        reporterId: employee,
        reporterName: '张三（员工）',
        assigneeId: engineer,
        assigneeName: '李工（工程师）',
        solution: null,
        lastRejectedReason: null,
        ageMs: 26 * HOUR,
      },
      {
        ticketNo: 'HD-00003',
        title: '打印机卡纸并有异响',
        description: '2 楼公共打印机经常卡纸，进纸时伴随明显异响。',
        urgency: 'normal',
        status: 'resolved',
        reporterId: employee,
        reporterName: '张三（员工）',
        assigneeId: engineer2,
        assigneeName: '王工（工程师）',
        solution: '清理了进纸滚轮上的碎纸并更换搓纸轮，连续打印 50 页无卡纸。',
        lastRejectedReason: null,
        ageMs: 8 * HOUR,
      },
      {
        ticketNo: 'HD-00004',
        title: '邮箱收不到外部邮件',
        description: '外部同事发来的邮件收不到，内部邮件正常。',
        urgency: 'high',
        status: 'closed',
        reporterId: employee,
        reporterName: '张三（员工）',
        assigneeId: engineer,
        assigneeName: '李工（工程师）',
        solution: '重新同步了邮件网关的黑名单规则，外部邮件已恢复正常投递。',
        lastRejectedReason: null,
        ageMs: 72 * HOUR,
      },
      {
        ticketNo: 'HD-00005',
        title: '会议室投影仪无法连接电脑',
        description: 'A 会议室投影仪用 HDMI 连接后无信号，已换线仍不行。',
        urgency: 'low',
        status: 'processing',
        reporterId: serviceDesk,
        reporterName: '赵服务台',
        assigneeId: engineer2,
        assigneeName: '王工（工程师）',
        solution: null,
        lastRejectedReason: '第一次处理后仍然无信号，请再检查接口。',
        ageMs: 5 * HOUR,
      },
    ];

    for (const ticket of tickets) {
      const createdAt = new Date(Date.now() - ticket.ageMs);
      const resolvedAt =
        ticket.status === 'resolved' || ticket.status === 'closed'
          ? new Date(createdAt.getTime() + 2 * HOUR)
          : null;
      const closedAt =
        ticket.status === 'closed'
          ? new Date(createdAt.getTime() + 3 * HOUR)
          : null;
      await connection.query
        .insertInto('helpDeskTickets')
        .values({
          ticketNo: ticket.ticketNo,
          title: ticket.title,
          description: ticket.description,
          urgency: ticket.urgency,
          status: ticket.status,
          reporterId: ticket.reporterId,
          reporterName: ticket.reporterName,
          assigneeId: ticket.assigneeId,
          assigneeName: ticket.assigneeName,
          screenshot: null,
          solution: ticket.solution,
          lastRejectedReason: ticket.lastRejectedReason,
          resolvedAt,
          closedAt,
          remindedAt: null,
          createdAt,
          updatedAt: closedAt ?? resolvedAt ?? createdAt,
        })
        .execute();
      const ticketId = Number(
        (
          await connection.query
            .selectFrom<{ id: number }>('helpDeskTickets')
            .select('id')
            .where('ticketNo', '=', ticket.ticketNo)
            .executeTakeFirst()
        )?.id,
      );

      await connection.query
        .insertInto('helpDeskTicketLogs')
        .values({
          ticketId,
          action: 'created',
          content: '提交了报修工单',
          authorId: ticket.reporterId,
          authorName: ticket.reporterName,
          createdAt,
        })
        .execute();
      if (ticket.assigneeId) {
        await connection.query
          .insertInto('helpDeskTicketLogs')
          .values({
            ticketId,
            action: 'assigned',
            content: `分派给 ${ticket.assigneeName}`,
            authorId: serviceDesk,
            authorName: '赵服务台',
            createdAt: new Date(createdAt.getTime() + 30 * 60 * 1000),
          })
          .execute();
      }
      if (ticket.solution) {
        await connection.query
          .insertInto('helpDeskTicketLogs')
          .values({
            ticketId,
            action: 'resolved',
            content: ticket.solution,
            authorId: ticket.assigneeId,
            authorName: ticket.assigneeName,
            createdAt: resolvedAt,
          })
          .execute();
      }
      if (ticket.status === 'closed') {
        await connection.query
          .insertInto('helpDeskTicketLogs')
          .values({
            ticketId,
            action: 'confirmed',
            content: '确认解决，工单关闭',
            authorId: ticket.reporterId,
            authorName: ticket.reporterName,
            createdAt: closedAt,
          })
          .execute();
      }
      if (ticket.lastRejectedReason) {
        await connection.query
          .insertInto('helpDeskTicketLogs')
          .values({
            ticketId,
            action: 'rejected',
            content: ticket.lastRejectedReason,
            authorId: ticket.reporterId,
            authorName: ticket.reporterName,
            createdAt: new Date(createdAt.getTime() + 90 * 60 * 1000),
          })
          .execute();
      }
    }
  }

  private async ensureDemoUser(
    users: {
      create: (input: {
        name: string;
        username: string;
        email: string;
        password: string;
      }) => Promise<{ id: string }>;
      list: (input: {
        search?: string;
      }) => Promise<{ items: readonly { id: string; email: string }[] }>;
    },
    demo: { email: string; username: string; name: string },
  ): Promise<string> {
    try {
      const created = await users.create({
        name: demo.name,
        username: demo.username,
        email: demo.email,
        password: DEMO_PASSWORD,
      });
      return created.id;
    } catch (error) {
      if (
        error instanceof UserAdministrationError &&
        (error.code === 'USER_EMAIL_CONFLICT' ||
          error.code === 'USER_IDENTITY_CONFLICT')
      ) {
        const page = await users.list({ search: demo.email });
        const existing = page.items.find((item) => item.email === demo.email);
        if (existing) return existing.id;
      }
      throw error;
    }
  }
}
