/**
 * Initial business configuration and demonstration fixtures for the IT repair
 * feature.
 *
 * The permission-set values are ordinary persisted configuration: a seed
 * writes them once so a fresh installation has working job roles, and an
 * administrator edits them afterwards. They are values, not code-owned
 * defaults, so the seed never overwrites an existing key.
 *
 * The demonstration accounts and tickets are fixtures for trying the feature.
 * They carry fixed identifiers and timestamps so a replayed seed produces the
 * same records. See `docs/it-service-demo-accounts.md` for the credentials.
 */
import { itTicketsResource } from '../../server/it-tickets/resources.ts';

import { definePermissionSet } from '@nocobase/authorization/permission-sets';

export const IT_TICKETS_NAMESPACE = 'nb3-factory';

export const IT_EMPLOYEE_SET_KEY = 'it.employee';
export const IT_HANDLER_SET_KEY = 'it.handler';

/**
 * Employees submit and follow their own tickets: the page, viewing their own
 * records, and creating. `start` and `complete` are deliberately absent.
 */
export const itEmployeePermissionSet = definePermissionSet(IT_EMPLOYEE_SET_KEY)
  .title({ key: 'itTickets.permissionSet.employee', ns: IT_TICKETS_NAMESPACE })
  .grant({
    resource: { type: 'page', id: 'it.tickets' },
    actions: [{ action: 'access' }],
  })
  .grant(
    itTicketsResource.reference().grant({
      view: { tickets: 'recordsIOwn' },
      create: { tickets: 'recordsIOwn' },
    }),
  )
  .build();

/**
 * Handlers see every ticket and drive it through its lifecycle. They do not
 * create tickets, because reporting is the employee's job.
 */
export const itHandlerPermissionSet = definePermissionSet(IT_HANDLER_SET_KEY)
  .title({ key: 'itTickets.permissionSet.handler', ns: IT_TICKETS_NAMESPACE })
  .grant({
    resource: { type: 'page', id: 'it.tickets' },
    actions: [{ action: 'access' }],
  })
  .grant(
    itTicketsResource.reference().grant({
      view: { tickets: 'allRecords' },
      start: { tickets: 'allRecords' },
      complete: { tickets: 'allRecords' },
    }),
  )
  .build();

export interface DemoUserFixture {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly name: string;
  readonly password: string;
  readonly permissionSetKey: string;
}

/** Two employees who report problems, and one handler who resolves them. */
export const IT_DEMO_USERS: readonly DemoUserFixture[] = [
  {
    id: 'it-demo-user-employee-li',
    username: 'employee.li',
    email: 'li.jing@example.com',
    name: '李静',
    password: 'ItDemo#2026',
    permissionSetKey: IT_EMPLOYEE_SET_KEY,
  },
  {
    id: 'it-demo-user-employee-wang',
    username: 'employee.wang',
    email: 'wang.qiang@example.com',
    name: '王强',
    password: 'ItDemo#2026',
    permissionSetKey: IT_EMPLOYEE_SET_KEY,
  },
  {
    id: 'it-demo-user-handler-chen',
    username: 'handler.chen',
    email: 'chen.tao@example.com',
    name: '陈涛',
    password: 'ItDemo#2026',
    permissionSetKey: IT_HANDLER_SET_KEY,
  },
];

export interface DemoTicketFixture {
  readonly id: string;
  readonly title: string;
  readonly category: 'computer' | 'account' | 'other';
  readonly description: string;
  readonly status: 'pending' | 'in_progress' | 'completed';
  readonly ownerUsername: string;
  readonly handlerUsername: string | null;
  readonly resolution: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Three fixed tickets that show every stage of the lifecycle. The pending one
 * gives a handler something to claim; the others show a ticket in progress and
 * a finished ticket with its handling note.
 */
export const IT_DEMO_TICKETS: readonly DemoTicketFixture[] = [
  {
    id: 'it-demo-ticket-001',
    title: '笔记本电脑无法开机',
    category: 'computer',
    description:
      '按下电源键后电源指示灯闪烁一次便熄灭，外接显示器也没有信号，昨天还是正常的。',
    status: 'pending',
    ownerUsername: 'employee.li',
    handlerUsername: null,
    resolution: null,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-01-05T01:20:00.000Z',
    updatedAt: '2026-01-05T01:20:00.000Z',
  },
  {
    id: 'it-demo-ticket-002',
    title: '邮箱账号无法登录',
    category: 'account',
    description: '输入正确密码后仍提示账号被锁定，需要重置密码并确认账号状态。',
    status: 'in_progress',
    ownerUsername: 'employee.wang',
    handlerUsername: 'handler.chen',
    resolution: null,
    startedAt: '2026-01-06T02:05:00.000Z',
    completedAt: null,
    createdAt: '2026-01-06T01:40:00.000Z',
    updatedAt: '2026-01-06T02:05:00.000Z',
  },
  {
    id: 'it-demo-ticket-003',
    title: '办公软件提示授权过期',
    category: 'other',
    description: '打开表格时提示订阅已过期，无法编辑，需要重新激活。',
    status: 'completed',
    ownerUsername: 'employee.li',
    handlerUsername: 'handler.chen',
    resolution:
      '已重新分配许可证并远程协助完成登录激活，请重启办公软件后确认可以正常编辑。',
    startedAt: '2026-01-07T03:10:00.000Z',
    completedAt: '2026-01-07T04:00:00.000Z',
    createdAt: '2026-01-07T02:50:00.000Z',
    updatedAt: '2026-01-07T04:00:00.000Z',
  },
];
