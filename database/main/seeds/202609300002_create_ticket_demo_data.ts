import { defineSeed, type QueryAdapter } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Isolated demonstration data for the IT support feature: two employees, one
 * handler, the Permission Set assignments that give each account its work, and
 * three tickets covering the three statuses.
 *
 * Everything here is idempotent and additive. Credentials are deliberately
 * demo-only and never surfaced in reports; on an installation that already has
 * these accounts the seed changes nothing.
 */

const EMPLOYEE_SET = 'it-support-employee';
const HANDLER_SET = 'it-support-handler';

interface DemoAccount {
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

const EMPLOYEE_ONE: DemoAccount = {
  username: 'employee.one',
  name: 'Employee One',
  email: 'employee.one@example.com',
  password: 'Demo12345!',
};
const EMPLOYEE_TWO: DemoAccount = {
  username: 'employee.two',
  name: 'Employee Two',
  email: 'employee.two@example.com',
  password: 'Demo12345!',
};
const HANDLER_ONE: DemoAccount = {
  username: 'handler.one',
  name: 'Handler One',
  email: 'handler.one@example.com',
  password: 'Demo12345!',
};

async function ensureUser(
  query: QueryAdapter,
  account: DemoAccount,
): Promise<string> {
  const existing = await query
    .selectFrom('user')
    .select('id')
    .where('username', '=', account.username)
    .executeTakeFirst();
  if (existing) {
    return String(existing.id);
  }

  const now = new Date();
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(account.password);

  await query
    .insertInto('user')
    .values({
      id: userId,
      name: account.name,
      username: account.username,
      email: account.email,
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
      password: passwordHash,
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
  name: '202609300002_create_ticket_demo_data',
  async run({ query }) {
    const employeeOneId = await ensureUser(query, EMPLOYEE_ONE);
    const employeeTwoId = await ensureUser(query, EMPLOYEE_TWO);
    const handlerId = await ensureUser(query, HANDLER_ONE);

    await ensureAssignment(query, employeeOneId, EMPLOYEE_SET);
    await ensureAssignment(query, employeeTwoId, EMPLOYEE_SET);
    await ensureAssignment(query, handlerId, HANDLER_SET);

    const existingTicket = await query
      .selectFrom('tickets')
      .select('id')
      .where('submitterId', 'in', [employeeOneId, employeeTwoId])
      .limit(1)
      .executeTakeFirst();
    if (existingTicket) {
      return;
    }

    const base = Date.now();
    const hour = 60 * 60 * 1000;
    await query
      .insertInto('tickets')
      .values([
        {
          title: '笔记本电脑无法开机',
          category: 'computer',
          description: '按下电源键没有任何反应，充电指示灯也不亮。',
          status: 'pending',
          resolution: null,
          submitterId: employeeOneId,
          handlerId: null,
          createdAt: new Date(base - 3 * hour),
          updatedAt: new Date(base - 3 * hour),
          handledAt: null,
        },
        {
          title: '无法登录内部报销系统',
          category: 'account',
          description: '输入正确密码后提示账号被锁定。',
          status: 'in_progress',
          resolution: null,
          submitterId: employeeTwoId,
          handlerId,
          createdAt: new Date(base - 2 * hour),
          updatedAt: new Date(base - 1 * hour),
          handledAt: null,
        },
        {
          title: '三楼打印机缺墨',
          category: 'other',
          description: '打印出的文件颜色很浅，需要更换墨盒。',
          status: 'completed',
          resolution: '已更换黑色墨盒，并清理了喷头，打印恢复正常。',
          submitterId: employeeOneId,
          handlerId,
          createdAt: new Date(base - 6 * hour),
          updatedAt: new Date(base - 4 * hour),
          handledAt: new Date(base - 4 * hour),
        },
      ])
      .execute();
  },
});
