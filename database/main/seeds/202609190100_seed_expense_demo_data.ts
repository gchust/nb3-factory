import {
  defineSeed,
  type SeedDefinition,
  type QueryAdapter,
} from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Demo data for the employee expense reimbursement application.
 *
 * Every record uses a fixed id and a fixed timestamp, so a repeated run is a no-op and never overwrites data a user
 * has edited. The accounts here are fictional and exist only so each business role can be tried out.
 */
const DEMO_PASSWORD = 'admin123';
const PAGE_IDS = [
  'expenses',
  'expenseApprovals',
  'expenseFinance',
  'expenseStatistics',
] as const;

interface DemoUser {
  readonly id: string;
  readonly username: string;
  readonly name: string;
  readonly email: string;
}

interface DemoItem {
  readonly category: string;
  readonly date: string;
  readonly amount: number;
  readonly description: string;
}

type EmployeeListRow = {
  id: string;
  userId: string;
  name: string;
  departmentId: string | null;
  role: string;
};

interface DemoReport {
  readonly id: string;
  readonly number: string;
  readonly owner: string;
  readonly status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';
  readonly purpose: string;
  readonly createdAt: string;
  readonly submittedAt?: string;
  readonly decidedAt?: string;
  readonly decisionComment?: string;
  readonly paidAt?: string;
  readonly items: readonly DemoItem[];
}

const USERS: readonly DemoUser[] = [
  {
    id: 'demo-user-wangqiang',
    username: 'wangqiang',
    name: '王强',
    email: 'wangqiang@example.com',
  },
  {
    id: 'demo-user-zhaomin',
    username: 'zhaomin',
    name: '赵敏',
    email: 'zhaomin@example.com',
  },
  {
    id: 'demo-user-zhangwei',
    username: 'zhangwei',
    name: '张伟',
    email: 'zhangwei@example.com',
  },
  {
    id: 'demo-user-lina',
    username: 'lina',
    name: '李娜',
    email: 'lina@example.com',
  },
  {
    id: 'demo-user-liuyang',
    username: 'liuyang',
    name: '刘洋',
    email: 'liuyang@example.com',
  },
  {
    id: 'demo-user-chenjing',
    username: 'chenjing',
    name: '陈静',
    email: 'chenjing@example.com',
  },
  {
    id: 'demo-user-sunli',
    username: 'sunli',
    name: '孙丽',
    email: 'sunli@example.com',
  },
];

const DEPARTMENTS = [
  { id: 'dept-engineering', code: 'ENG', name: '研发部', sort: 10 },
  { id: 'dept-marketing', code: 'MKT', name: '市场部', sort: 20 },
] as const;

const CATEGORIES = [
  { id: 'cat-travel', code: 'TRAVEL', name: '差旅费', sort: 10 },
  { id: 'cat-meal', code: 'MEAL', name: '餐饮费', sort: 20 },
  { id: 'cat-office', code: 'OFFICE', name: '办公用品', sort: 30 },
  { id: 'cat-training', code: 'TRAINING', name: '培训费', sort: 40 },
  { id: 'cat-communication', code: 'COMM', name: '通讯费', sort: 50 },
  { id: 'cat-other', code: 'OTHER', name: '其他', sort: 60 },
] as const;

const EMPLOYEES = [
  {
    id: 'emp-wangqiang',
    userId: 'demo-user-wangqiang',
    name: '王强',
    role: 'manager',
    departmentId: 'dept-engineering',
    managerUserId: null,
  },
  {
    id: 'emp-zhaomin',
    userId: 'demo-user-zhaomin',
    name: '赵敏',
    role: 'manager',
    departmentId: 'dept-marketing',
    managerUserId: null,
  },
  {
    id: 'emp-zhangwei',
    userId: 'demo-user-zhangwei',
    name: '张伟',
    role: 'employee',
    departmentId: 'dept-engineering',
    managerUserId: 'demo-user-wangqiang',
  },
  {
    id: 'emp-lina',
    userId: 'demo-user-lina',
    name: '李娜',
    role: 'employee',
    departmentId: 'dept-engineering',
    managerUserId: 'demo-user-wangqiang',
  },
  {
    id: 'emp-liuyang',
    userId: 'demo-user-liuyang',
    name: '刘洋',
    role: 'employee',
    departmentId: 'dept-marketing',
    managerUserId: 'demo-user-zhaomin',
  },
  {
    id: 'emp-chenjing',
    userId: 'demo-user-chenjing',
    name: '陈静',
    role: 'employee',
    departmentId: 'dept-marketing',
    managerUserId: 'demo-user-zhaomin',
  },
  {
    id: 'emp-sunli',
    userId: 'demo-user-sunli',
    name: '孙丽',
    role: 'finance',
    departmentId: null,
    managerUserId: null,
  },
] as const;

const REPORTS: readonly DemoReport[] = [
  {
    id: 'rpt-0001',
    number: 'EXP-2026-0001',
    owner: 'demo-user-zhangwei',
    status: 'draft',
    purpose: '上海客户现场支持差旅',
    createdAt: '2026-08-03T01:00:00.000Z',
    items: [
      {
        category: 'cat-travel',
        date: '2026-08-01T00:00:00.000Z',
        amount: 1200,
        description: '往返高铁票',
      },
      {
        category: 'cat-meal',
        date: '2026-08-01T00:00:00.000Z',
        amount: 300,
        description: '现场工作餐',
      },
    ],
  },
  {
    id: 'rpt-0002',
    number: 'EXP-2026-0002',
    owner: 'demo-user-lina',
    status: 'draft',
    purpose: '研发部季度办公用品采购',
    createdAt: '2026-08-04T02:00:00.000Z',
    items: [
      {
        category: 'cat-office',
        date: '2026-08-02T00:00:00.000Z',
        amount: 480,
        description: '键盘与显示器支架',
      },
    ],
  },
  {
    id: 'rpt-0003',
    number: 'EXP-2026-0003',
    owner: 'demo-user-liuyang',
    status: 'draft',
    purpose: '渠道合作伙伴洽谈餐费',
    createdAt: '2026-08-05T03:00:00.000Z',
    items: [
      {
        category: 'cat-meal',
        date: '2026-08-03T00:00:00.000Z',
        amount: 800,
        description: '合作方工作晚餐',
      },
    ],
  },
  {
    id: 'rpt-0004',
    number: 'EXP-2026-0004',
    owner: 'demo-user-zhangwei',
    status: 'submitted',
    purpose: '北京行业峰会差旅',
    createdAt: '2026-08-06T01:00:00.000Z',
    submittedAt: '2026-08-07T01:30:00.000Z',
    items: [
      {
        category: 'cat-travel',
        date: '2026-08-05T00:00:00.000Z',
        amount: 2400,
        description: '往返机票与住宿',
      },
      {
        category: 'cat-meal',
        date: '2026-08-06T00:00:00.000Z',
        amount: 260,
        description: '会议期间餐费',
      },
    ],
  },
  {
    id: 'rpt-0005',
    number: 'EXP-2026-0005',
    owner: 'demo-user-lina',
    status: 'submitted',
    purpose: '前端性能优化培训',
    createdAt: '2026-08-06T04:00:00.000Z',
    submittedAt: '2026-08-07T02:00:00.000Z',
    items: [
      {
        category: 'cat-training',
        date: '2026-08-06T00:00:00.000Z',
        amount: 3600,
        description: '线下培训课程费用',
      },
    ],
  },
  {
    id: 'rpt-0006',
    number: 'EXP-2026-0006',
    owner: 'demo-user-chenjing',
    status: 'submitted',
    purpose: '市场部日常办公采购',
    createdAt: '2026-08-07T05:00:00.000Z',
    submittedAt: '2026-08-08T01:00:00.000Z',
    items: [
      {
        category: 'cat-office',
        date: '2026-08-07T00:00:00.000Z',
        amount: 620,
        description: '打印耗材与文具',
      },
      {
        category: 'cat-communication',
        date: '2026-08-07T00:00:00.000Z',
        amount: 120,
        description: '客户沟通电话费',
      },
    ],
  },
  {
    id: 'rpt-0007',
    number: 'EXP-2026-0007',
    owner: 'demo-user-liuyang',
    status: 'approved',
    purpose: '新品发布会招待费',
    createdAt: '2026-08-08T01:00:00.000Z',
    submittedAt: '2026-08-09T01:00:00.000Z',
    decidedAt: '2026-08-10T02:00:00.000Z',
    items: [
      {
        category: 'cat-meal',
        date: '2026-08-08T00:00:00.000Z',
        amount: 1580,
        description: '媒体招待晚餐',
      },
    ],
  },
  {
    id: 'rpt-0008',
    number: 'EXP-2026-0008',
    owner: 'demo-user-chenjing',
    status: 'approved',
    purpose: '广州客户走访差旅',
    createdAt: '2026-08-09T02:00:00.000Z',
    submittedAt: '2026-08-10T01:00:00.000Z',
    decidedAt: '2026-08-11T03:00:00.000Z',
    items: [
      {
        category: 'cat-travel',
        date: '2026-08-09T00:00:00.000Z',
        amount: 980,
        description: '高铁二等座',
      },
      {
        category: 'cat-communication',
        date: '2026-08-09T00:00:00.000Z',
        amount: 90,
        description: '漫游通讯费',
      },
    ],
  },
  {
    id: 'rpt-0009',
    number: 'EXP-2026-0009',
    owner: 'demo-user-zhangwei',
    status: 'approved',
    purpose: '研发团队月度通讯补贴',
    createdAt: '2026-08-10T03:00:00.000Z',
    submittedAt: '2026-08-11T01:00:00.000Z',
    decidedAt: '2026-08-12T02:00:00.000Z',
    items: [
      {
        category: 'cat-communication',
        date: '2026-08-10T00:00:00.000Z',
        amount: 300,
        description: '值班手机通讯费',
      },
    ],
  },
  {
    id: 'rpt-0010',
    number: 'EXP-2026-0010',
    owner: 'demo-user-lina',
    status: 'rejected',
    purpose: '架构师认证考试报名',
    createdAt: '2026-08-11T01:00:00.000Z',
    submittedAt: '2026-08-12T01:00:00.000Z',
    decidedAt: '2026-08-13T01:00:00.000Z',
    decisionComment: '发票信息不全，请补充完整后重新提交。',
    items: [
      {
        category: 'cat-training',
        date: '2026-08-11T00:00:00.000Z',
        amount: 2200,
        description: '认证考试报名费',
      },
    ],
  },
  {
    id: 'rpt-0011',
    number: 'EXP-2026-0011',
    owner: 'demo-user-chenjing',
    status: 'rejected',
    purpose: '展会物料制作',
    createdAt: '2026-08-12T02:00:00.000Z',
    submittedAt: '2026-08-13T01:00:00.000Z',
    decidedAt: '2026-08-14T01:00:00.000Z',
    decisionComment: '超出部门本季度预算，请拆分后重新提交。',
    items: [
      {
        category: 'cat-office',
        date: '2026-08-12T00:00:00.000Z',
        amount: 1500,
        description: '展会展架与印刷品',
      },
    ],
  },
  {
    id: 'rpt-0012',
    number: 'EXP-2026-0012',
    owner: 'demo-user-liuyang',
    status: 'paid',
    purpose: '年度客户答谢晚宴',
    createdAt: '2026-08-13T01:00:00.000Z',
    submittedAt: '2026-08-14T01:00:00.000Z',
    decidedAt: '2026-08-15T01:00:00.000Z',
    paidAt: '2026-08-16T02:00:00.000Z',
    items: [
      {
        category: 'cat-meal',
        date: '2026-08-13T00:00:00.000Z',
        amount: 2600,
        description: '客户答谢晚宴餐费',
      },
    ],
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609190100_seed_expense_demo_data',

  async run({ query }) {
    const now = new Date();
    await ensureUsers(query, now);
    await ensureRows(
      query,
      'expenseDepartments',
      DEPARTMENTS.map((row) => ({ ...row, createdAt: now, updatedAt: now })),
    );
    await ensureRows(
      query,
      'expenseCategories',
      CATEGORIES.map((row) => ({ ...row, createdAt: now, updatedAt: now })),
    );
    await ensureEmployees(query, now);
    await ensureReports(query);
    await ensurePageAccess(query, now);
  },
});

export default seed;

async function ensureUsers(query: QueryAdapter, now: Date): Promise<void> {
  for (const user of USERS) {
    const existing = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', user.username)
      .executeTakeFirst();
    if (existing) continue;
    await query
      .insertInto('user')
      .values({
        id: user.id,
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
        id: `demo-account-${user.username}`,
        issuer: 'local:credential',
        accountId: user.id,
        providerId: 'credential',
        userId: user.id,
        password: await hashPassword(DEMO_PASSWORD),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }
}

async function ensureEmployees(query: QueryAdapter, now: Date): Promise<void> {
  for (const employee of EMPLOYEES) {
    const existing = await query
      .selectFrom('expenseEmployees')
      .select('id')
      .where('id', '=', employee.id)
      .executeTakeFirst();
    if (existing) continue;
    const user = USERS.find((row) => row.id === employee.userId);
    const userRow = user
      ? await query
          .selectFrom('user')
          .select('id')
          .where('username', '=', user.username)
          .executeTakeFirst()
      : undefined;
    if (!userRow) continue;
    await query
      .insertInto('expenseEmployees')
      .values({
        id: employee.id,
        userId: String(userRow.id),
        name: employee.name,
        role: employee.role,
        departmentId: employee.departmentId,
        managerUserId: employee.managerUserId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  const admin = await findAdministratorUserId(query);
  if (!admin) return;
  const existingAdmin = await query
    .selectFrom('expenseEmployees')
    .select('id')
    .where('userId', '=', admin)
    .executeTakeFirst();
  if (existingAdmin) return;
  await query
    .insertInto('expenseEmployees')
    .values({
      id: 'emp-administrator',
      userId: admin,
      name: '系统管理员',
      role: 'admin',
      departmentId: null,
      managerUserId: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function ensureReports(query: QueryAdapter): Promise<void> {
  const employeeRows = await query
    .selectFrom<EmployeeListRow>('expenseEmployees')
    .select(['id', 'userId', 'name', 'departmentId', 'role'])
    .execute<EmployeeListRow>();
  const employeeByUserId = new Map(
    employeeRows.map((row) => [row.userId, row]),
  );
  const managerByDepartment = new Map<string, string>();
  for (const row of employeeRows) {
    if (row.role === 'manager' && row.departmentId) {
      managerByDepartment.set(row.departmentId, row.userId);
    }
  }
  const finance = employeeRows.find((row) => row.role === 'finance');
  const paidBy = finance?.userId ?? 'system';
  const paidByName = finance?.name ?? paidBy;

  for (const report of REPORTS) {
    const existing = await query
      .selectFrom('expenseReports')
      .select('id')
      .where('id', '=', report.id)
      .executeTakeFirst();
    if (existing) continue;
    const owner = employeeByUserId.get(report.owner);
    if (!owner || !owner.departmentId) continue;
    const departmentId = owner.departmentId;
    const totalAmount = report.items.reduce(
      (sum, item) => sum + item.amount,
      0,
    );
    const decidedBy = managerByDepartment.get(departmentId) ?? null;
    const createdAt = new Date(report.createdAt);

    await query
      .insertInto('expenseReports')
      .values({
        id: report.id,
        number: report.number,
        employeeId: owner.id,
        departmentId,
        status: report.status,
        totalAmount,
        purpose: report.purpose,
        submittedAt: report.submittedAt ? new Date(report.submittedAt) : null,
        decidedAt: report.decidedAt ? new Date(report.decidedAt) : null,
        paidAt: report.paidAt ? new Date(report.paidAt) : null,
        decidedBy: report.decidedAt ? decidedBy : null,
        decisionComment: report.decisionComment ?? null,
        paidBy: report.paidAt ? paidBy : null,
        createdAt,
        updatedAt: createdAt,
      })
      .execute();

    let itemIndex = 0;
    for (const item of report.items) {
      itemIndex += 1;
      await query
        .insertInto('expenseItems')
        .values({
          id: `${report.id}-item-${itemIndex}`,
          reportId: report.id,
          categoryId: item.category,
          expenseDate: new Date(item.date),
          amount: item.amount,
          description: item.description,
          createdAt,
        })
        .execute();
    }

    await insertAction(query, {
      reportId: report.id,
      action: 'create',
      actorId: owner.userId,
      actorName: owner.name,
      fromStatus: null,
      toStatus: 'draft',
      comment: null,
      createdAt,
    });

    if (report.submittedAt) {
      const submittedAt = new Date(report.submittedAt);
      await insertAction(query, {
        reportId: report.id,
        action: 'submit',
        actorId: owner.userId,
        actorName: owner.name,
        fromStatus: 'draft',
        toStatus: 'submitted',
        comment: null,
        createdAt: submittedAt,
      });
    }

    if (report.decidedAt) {
      const decidedAt = new Date(report.decidedAt);
      await insertAction(query, {
        reportId: report.id,
        action: report.status === 'rejected' ? 'reject' : 'approve',
        actorId: decidedBy ?? 'system',
        actorName: decidedBy
          ? (employeeByUserId.get(decidedBy)?.name ?? decidedBy)
          : 'system',
        fromStatus: 'submitted',
        toStatus: report.status === 'rejected' ? 'rejected' : 'approved',
        comment: report.decisionComment ?? null,
        createdAt: decidedAt,
      });
    }

    if (report.paidAt) {
      const paidAt = new Date(report.paidAt);
      await query
        .insertInto('expensePayments')
        .values({
          id: `${report.id}-payment`,
          reportId: report.id,
          amount: totalAmount,
          paidBy,
          paidAt,
          createdAt: paidAt,
        })
        .execute();
      await insertAction(query, {
        reportId: report.id,
        action: 'pay',
        actorId: paidBy,
        actorName: paidByName,
        fromStatus: 'approved',
        toStatus: 'paid',
        comment: null,
        createdAt: paidAt,
      });
    }
  }
}

async function ensurePageAccess(query: QueryAdapter, now: Date): Promise<void> {
  const existing = await query
    .selectFrom('authorizationPermissionSets')
    .select('key')
    .where('key', '=', 'expense-pages')
    .executeTakeFirst();
  if (!existing) {
    await query
      .insertInto('authorizationPermissionSets')
      .values({
        id: 'expense-pages',
        key: 'expense-pages',
        title: 'Expense reimbursement pages',
        grants: JSON.stringify(
          PAGE_IDS.map((id) => ({
            resource: { type: 'page', id },
            actions: [{ action: 'access' }],
          })),
        ),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }
  const assignmentId = 'authenticated:*:expense-pages';
  const assignment = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('id')
    .where('id', '=', assignmentId)
    .executeTakeFirst();
  if (assignment) return;
  await query
    .insertInto('authorizationPermissionSetAssignments')
    .values({
      id: assignmentId,
      subjectType: 'authenticated',
      subjectId: '*',
      permissionSetKey: 'expense-pages',
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function insertAction(
  query: QueryAdapter,
  action: {
    reportId: string;
    action: string;
    actorId: string;
    actorName: string;
    fromStatus: string | null;
    toStatus: string | null;
    comment: string | null;
    createdAt: Date;
  },
): Promise<void> {
  await query
    .insertInto('expenseActions')
    .values({
      id: `${action.reportId}-action-${action.action}-${action.createdAt.getTime()}`,
      ...action,
    })
    .execute();
}

async function findAdministratorUserId(
  query: QueryAdapter,
): Promise<string | null> {
  const assignment = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select(['subjectType', 'subjectId'])
    .where('permissionSetKey', '=', 'system-administrator')
    .executeTakeFirst();
  if (assignment && assignment.subjectType === 'user') {
    return String(assignment.subjectId);
  }
  const user = await query
    .selectFrom('user')
    .select('id')
    .where('username', '=', 'nocobase')
    .executeTakeFirst();
  return user ? String(user.id) : null;
}

async function ensureRows(
  query: QueryAdapter,
  table: string,
  rows: readonly Record<string, unknown>[],
): Promise<void> {
  for (const row of rows) {
    const existing = await query
      .selectFrom(table)
      .select('id')
      .where('id', '=', String(row.id))
      .executeTakeFirst();
    if (existing) continue;
    await query.insertInto(table).values(row).execute();
  }
}
