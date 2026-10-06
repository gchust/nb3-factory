import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Demonstration identities and tickets for the ticket feature. The identifiers
 * are fixed so a re-run recognizes its own rows instead of duplicating them,
 * and the timestamps are fixed so every installation starts from the same
 * sample. This is practice data; it never overwrites a row a person edited.
 */
const EMPLOYEE_ZHANGWEI = '11111111-1111-4111-8111-111111111111';
const EMPLOYEE_LINA = '22222222-2222-4222-8222-222222222222';
const HANDLER_WANGQIANG = '33333333-3333-4333-8333-333333333333';

const PASSWORD = 'Ticket123!';
const HANDLER_PASSWORD = 'Handler123!';
const DEMO_CREATED_AT = new Date('2026-09-01T00:00:00.000Z');

const users = [
  {
    id: EMPLOYEE_ZHANGWEI,
    accountId: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: '张伟',
    username: 'zhangwei',
    email: 'zhangwei@example.com',
    password: PASSWORD,
    permissionSetKey: 'ticket-employee',
  },
  {
    id: EMPLOYEE_LINA,
    accountId: '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: '李娜',
    username: 'lina',
    email: 'lina@example.com',
    password: PASSWORD,
    permissionSetKey: 'ticket-employee',
  },
  {
    id: HANDLER_WANGQIANG,
    accountId: '33333333-cccc-4ccc-8ccc-cccccccccccc',
    name: '王强',
    username: 'wangqiang',
    email: 'wangqiang@example.com',
    password: HANDLER_PASSWORD,
    permissionSetKey: 'ticket-handler',
  },
];

const tickets = [
  {
    title: '工位台式机无法开机',
    category: 'computer',
    description: '按下电源键没有任何反应，电源灯也不亮。',
    status: 'pending',
    resolution: null,
    submitterId: EMPLOYEE_ZHANGWEI,
    handlerId: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-09-01T01:10:00.000Z'),
    updatedAt: new Date('2026-09-01T01:10:00.000Z'),
  },
  {
    title: '企业邮箱无法登录',
    category: 'account',
    description: '连续提示密码错误，已经确认大小写。',
    status: 'in_progress',
    resolution: null,
    submitterId: EMPLOYEE_LINA,
    handlerId: HANDLER_WANGQIANG,
    startedAt: new Date('2026-09-02T02:30:00.000Z'),
    completedAt: null,
    createdAt: new Date('2026-09-02T02:05:00.000Z'),
    updatedAt: new Date('2026-09-02T02:30:00.000Z'),
  },
  {
    title: '会议室投影仪没有信号',
    category: 'other',
    description: '连接 HDMI 后投影仪一直显示无信号。',
    status: 'completed',
    resolution: '更换了损坏的 HDMI 线，并重新固定了接口，测试正常。',
    submitterId: EMPLOYEE_ZHANGWEI,
    handlerId: HANDLER_WANGQIANG,
    startedAt: new Date('2026-09-03T03:00:00.000Z'),
    completedAt: new Date('2026-09-03T03:40:00.000Z'),
    createdAt: new Date('2026-09-03T02:50:00.000Z'),
    updatedAt: new Date('2026-09-03T03:40:00.000Z'),
  },
];

export default defineSeed({
  name: '202610010002_ticket_demo_data',
  transaction: true,
  async run({ query }) {
    for (const user of users) {
      const existingUser = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', user.username)
        .executeTakeFirst();
      if (!existingUser) {
        const passwordHash = await hashPassword(user.password);
        await query
          .insertInto('user')
          .values({
            id: user.id,
            name: user.name,
            username: user.username,
            email: user.email,
            emailVerified: true,
            createdAt: DEMO_CREATED_AT,
            updatedAt: DEMO_CREATED_AT,
          })
          .execute();
        await query
          .insertInto('account')
          .values({
            id: user.accountId,
            accountId: user.id,
            providerId: 'credential',
            userId: user.id,
            password: passwordHash,
            createdAt: DEMO_CREATED_AT,
            updatedAt: DEMO_CREATED_AT,
          })
          .execute();
      }

      const existingAssignment = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('subjectType', '=', 'user')
        .where('subjectId', '=', user.id)
        .where('permissionSetKey', '=', user.permissionSetKey)
        .executeTakeFirst();
      if (!existingAssignment) {
        await query
          .insertInto('authorizationPermissionSetAssignments')
          .values({
            id: `${user.id}:${user.permissionSetKey}`,
            subjectType: 'user',
            subjectId: user.id,
            permissionSetKey: user.permissionSetKey,
            createdAt: DEMO_CREATED_AT,
            updatedAt: DEMO_CREATED_AT,
          })
          .execute();
      }
    }

    for (const ticket of tickets) {
      const existingTicket = await query
        .selectFrom('tickets')
        .select('id')
        .where('submitterId', '=', ticket.submitterId)
        .where('title', '=', ticket.title)
        .executeTakeFirst();
      if (existingTicket) continue;
      await query.insertInto('tickets').values(ticket).execute();
    }
  },
});
