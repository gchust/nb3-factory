import { defineSeed } from '@nocobase/db';
import type { QueryAdapter } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Demonstration accounts written on a fresh installation only.
 *
 * Credentials (development fixtures — never printed in a report, never used in
 * production): every account signs in with the password `demo1234`.
 *   - li.wei@example.com    (李伟, employee)
 *   - wang.fang@example.com (王芳, employee)
 *   - chen.hao@example.com  (陈浩, handling staff)
 *
 * Ticket seeding is guarded by the table itself: once any ticket exists the
 * example rows are considered installed and are never re-created, so real
 * business data is never mixed with fixtures.
 */

const DEMO_PASSWORD = 'demo1234';

interface DemoUser {
  readonly name: string;
  readonly username: string;
  readonly email: string;
}

const EMPLOYEES: readonly DemoUser[] = [
  { name: '李伟', username: 'li.wei', email: 'li.wei@example.com' },
  { name: '王芳', username: 'wang.fang', email: 'wang.fang@example.com' },
];

const HANDLERS: readonly DemoUser[] = [
  { name: '陈浩', username: 'chen.hao', email: 'chen.hao@example.com' },
];

async function ensureUser(
  query: QueryAdapter,
  user: DemoUser,
): Promise<string> {
  const existing = await query
    .selectFrom('user')
    .select('id')
    .where('username', '=', user.username)
    .executeTakeFirst();
  if (existing) {
    return String(existing.id);
  }
  const now = new Date();
  const userId = crypto.randomUUID();
  await query
    .insertInto('user')
    .values({
      id: userId,
      name: user.name,
      username: user.username,
      email: user.email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await query
    .insertInto('account')
    .values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: await hashPassword(DEMO_PASSWORD),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  return userId;
}

async function ensureAssignment(
  query: QueryAdapter,
  userId: string,
  permissionSetKey: string,
): Promise<void> {
  const id = `user:${userId}:${permissionSetKey}`;
  const existing = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('id')
    .where('id', '=', id)
    .executeTakeFirst();
  if (existing) {
    return;
  }
  const now = new Date();
  await query
    .insertInto('authorizationPermissionSetAssignments')
    .values({
      id,
      subjectType: 'user',
      subjectId: userId,
      permissionSetKey,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

export default defineSeed({
  name: '202609290003_repair_tickets_demo_data',
  transaction: true,
  async run({ query }) {
    const employeeIds: string[] = [];
    for (const user of EMPLOYEES) {
      const id = await ensureUser(query, user);
      employeeIds.push(id);
      await ensureAssignment(query, id, 'it-employee');
    }
    const handlerId = await ensureUser(query, HANDLERS[0]);
    await ensureAssignment(query, handlerId, 'it-handler');

    const existingTicket = await query
      .selectFrom('repairTickets')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existingTicket) {
      return;
    }

    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const [firstEmployee, secondEmployee] = employeeIds;
    await query
      .insertInto('repairTickets')
      .values([
        {
          id: crypto.randomUUID(),
          title: '笔记本电脑无法开机',
          category: 'computer',
          description: '按电源键后指示灯闪烁，屏幕始终不亮。',
          status: 'pending',
          resolution: null,
          submitterId: firstEmployee,
          handlerId: null,
          startedAt: null,
          completedAt: null,
          createdAt: new Date(now - 2 * day),
          updatedAt: new Date(now - 2 * day),
        },
        {
          id: crypto.randomUUID(),
          title: '邮箱账号无法登录',
          category: 'account',
          description: '输入正确密码后仍提示认证失败。',
          status: 'processing',
          resolution: null,
          submitterId: secondEmployee,
          handlerId,
          startedAt: new Date(now - day),
          completedAt: null,
          createdAt: new Date(now - 3 * day),
          updatedAt: new Date(now - day),
        },
        {
          id: crypto.randomUUID(),
          title: '办公区打印机连接异常',
          category: 'other',
          description: '打印任务一直停留在队列中，无法出纸。',
          status: 'completed',
          resolution: '已重新安装打印驱动并清理队列，恢复正常。',
          submitterId: firstEmployee,
          handlerId,
          startedAt: new Date(now - 5 * day),
          completedAt: new Date(now - 4 * day),
          createdAt: new Date(now - 6 * day),
          updatedAt: new Date(now - 4 * day),
        },
      ])
      .execute();
  },
});
