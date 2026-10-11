import type { Application } from '@nocobase/app-server/application';
import { sampleDataToken } from '@nocobase/app-server/sample-data';
import type { DatabaseManager } from '@nocobase/db';
import { databaseManagerToken } from '@nocobase/db';
import {
  userManagementServiceToken,
  type UserManagementService,
} from '@nocobase/app-plugin-users/server';

import {
  itTicketServiceToken,
  type ItTeamRole,
  type ItTicketService,
} from './service.js';

/**
 * Example data for the service desk: four colleagues with different roles and
 * one ticket in each state, so the dashboard, the queues and the notification
 * links all have something to show the first time someone signs in.
 *
 * It is registered on `sampleDataToken`, so it only builds when the database
 * was installed with `app.sampleData` set, and it is recorded under
 * `sample-data:it-tickets-demo`. Every step checks for the row it is about to
 * create, so running it again by hand changes nothing.
 */

const PACKAGE_NAME = 'nb3-factory';
const SAMPLE_NAME = 'it-tickets-demo';
export const DEMO_PASSWORD = 'Demo123456';

interface DemoUser {
  readonly username: string;
  readonly email: string;
  readonly name: string;
  readonly role: ItTeamRole | null;
}

const DEMO_USERS: readonly DemoUser[] = [
  {
    username: 'zhang.san',
    email: 'zhang.san@example.com',
    name: '张三 / Zhang San',
    role: null,
  },
  {
    username: 'li.si',
    email: 'li.si@example.com',
    name: '李四 / Li Si',
    role: 'engineer',
  },
  {
    username: 'wang.wu',
    email: 'wang.wu@example.com',
    name: '王五 / Wang Wu',
    role: 'engineer',
  },
  {
    username: 'zhao.liu',
    email: 'zhao.liu@example.com',
    name: '赵六 / Zhao Liu',
    role: 'serviceDesk',
  },
];

interface UserRow {
  id: string;
  email: string;
}

interface TeamMemberRow {
  id: number;
  userId: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TicketTimestampRow {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  statusChangedAt: Date;
}

const HOUR = 60 * 60 * 1000;

export function registerItTicketSampleData(app: Application): void {
  const service = app.container.resolve(sampleDataToken);
  service.register({
    name: SAMPLE_NAME,
    packageName: PACKAGE_NAME,
    run: () => buildSampleData(app),
  });
}

async function buildSampleData(app: Application): Promise<void> {
  const database = app.container.resolve<DatabaseManager>(databaseManagerToken);
  const users = app.container.resolve<UserManagementService>(
    userManagementServiceToken,
  );
  const tickets = app.container.resolve<ItTicketService>(itTicketServiceToken);

  const ids = new Map<string, string>();
  for (const demo of DEMO_USERS) {
    ids.set(demo.email, await ensureUser(database, users, demo));
  }
  for (const demo of DEMO_USERS) {
    if (demo.role) {
      await ensureTeamMember(database, ids.get(demo.email)!, demo.role);
    }
  }

  await ensureTickets(database, tickets, ids);
}

async function ensureUser(
  database: DatabaseManager,
  users: UserManagementService,
  demo: DemoUser,
): Promise<string> {
  const existing = await database
    .repository<UserRow>('user')
    .findOne({ filter: { email: demo.email } });
  if (existing) {
    return existing.id;
  }
  const created = await users.create({
    name: demo.name,
    username: demo.username,
    email: demo.email,
    password: DEMO_PASSWORD,
  });
  return created.id;
}

async function ensureTeamMember(
  database: DatabaseManager,
  userId: string,
  role: ItTeamRole,
): Promise<void> {
  const team = database.repository<TeamMemberRow>('itTeamMembers');
  const existing = await team.findOne({ filter: { userId } });
  const timestamp = new Date();
  if (existing) {
    if (existing.role !== role) {
      await team.updateOne({
        filter: { userId },
        values: { role, updatedAt: timestamp },
      });
    }
    return;
  }
  await team.createOne({
    values: { userId, role, createdAt: timestamp, updatedAt: timestamp },
  });
}

async function ensureTickets(
  database: DatabaseManager,
  tickets: ItTicketService,
  ids: Map<string, string>,
): Promise<void> {
  const existing = await database
    .repository<{ id: number }>('itTickets')
    .count({});
  if (existing > 0) {
    // The database already carries business tickets; never add demo rows on top.
    return;
  }

  const reporter = { userId: ids.get('zhang.san@example.com')! };
  const secondReporter = { userId: ids.get('li.si@example.com')! };
  const engineerA = { userId: ids.get('li.si@example.com')! };
  const engineerB = { userId: ids.get('wang.wu@example.com')! };
  const serviceDesk = { userId: ids.get('zhao.liu@example.com')! };

  // Pending and already past the 24-hour mark, so the dashboard's overdue
  // figure and the service desk's reminder both have a real case.
  const waiting = await tickets.create(reporter, {
    title: '办公室打印机无法打印 / Office printer will not print',
    description:
      '三楼打印机显示缺纸，但纸盒是满的，重启后仍然报错。 / The third-floor printer reports a paper fault while the tray is full; restarting did not help.',
    urgency: 'high',
  });
  await backdate(database, waiting.id, 30 * HOUR);

  const processing = await tickets.create(reporter, {
    title: 'VPN 无法连接 / Cannot connect to the VPN',
    description:
      '在家办公时 VPN 一直提示认证失败。 / The VPN keeps reporting an authentication failure when working from home.',
    urgency: 'normal',
  });
  await tickets.assign(serviceDesk, processing.id, engineerA.userId);
  await tickets.process(
    engineerA,
    processing.id,
    '已核对企业目录账号，正在重建 VPN 配置文件。 / Checked the directory account and am rebuilding the VPN profile.',
  );

  const resolved = await tickets.create(reporter, {
    title: '邮箱容量已满 / Mailbox is full',
    description:
      '无法接收新邮件，提示容量已满。 / Cannot receive new mail; the mailbox reports it is full.',
    urgency: 'low',
  });
  await tickets.assign(serviceDesk, resolved.id, engineerB.userId);
  await tickets.resolve(
    engineerB,
    resolved.id,
    '已归档两年前的邮件并扩容至 50GB。 / Archived mail older than two years and raised the quota to 50GB.',
  );

  const closed = await tickets.create(secondReporter, {
    title: '显示器闪烁 / Monitor flickers',
    description:
      '外接显示器每隔几秒闪一下。 / The external monitor flickers every few seconds.',
    urgency: 'normal',
  });
  await tickets.assign(serviceDesk, closed.id, engineerB.userId);
  await tickets.resolve(
    engineerB,
    closed.id,
    '更换了 DisplayPort 线缆，画面稳定。 / Replaced the DisplayPort cable; the picture is stable.',
  );
  await tickets.close(
    secondReporter,
    closed.id,
    '已确认，感谢。 / Confirmed, thank you.',
  );
}

/**
 * Move a ticket's clock back so the SLA state is visible without waiting a
 * day. Only the timestamps are touched; the history rows keep their own.
 */
async function backdate(
  database: DatabaseManager,
  ticketId: number,
  ageMs: number,
): Promise<void> {
  const when = new Date(Date.now() - ageMs);
  await database.repository<TicketTimestampRow>('itTickets').updateOne({
    filter: { id: ticketId },
    values: { createdAt: when, updatedAt: when, statusChangedAt: when },
  });
}
