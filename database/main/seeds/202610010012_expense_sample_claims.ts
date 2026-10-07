import { defineSeed } from '@nocobase/db';
import type { QueryAdapter } from '@nocobase/db';

/**
 * A handful of reimbursements in every state of the workflow, so the lists, the approval queue and the dashboard have
 * something to show.
 *
 * This is sample data. It exists so the feature can be demonstrated without hand-entering a week of claims, and it is
 * keyed by `claimNo`: an installation that already holds a claim with that number keeps it untouched. Delete these
 * rows when the installation starts carrying real work; nothing in the application depends on them.
 */

interface ClaimRow {
  id: string;
  claimNo: string;
  title: string;
  applicantId: string;
  applicantName: string;
  departmentId: string | null;
  departmentName: string | null;
  status: string;
  totalAmount: number;
  remark: string | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  paidAt: Date | null;
  paymentMethod: string | null;
  paymentRemark: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ItemRow {
  id: string;
  claimId: string;
  category: string;
  amount: number;
  expenseDate: Date | null;
  description: string | null;
  invoiceId: string | null;
  invoiceName: string | null;
  invoiceExt: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ApprovalRow {
  id: string;
  claimId: string;
  action: string;
  operatorId: string;
  operatorName: string;
  fromStatus: string;
  toStatus: string;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ItemSpec {
  category: string;
  amount: number;
  expenseDate: string;
  description: string;
}

interface ApprovalSpec {
  action: 'submit' | 'approve' | 'reject' | 'pay';
  operator: string;
  fromStatus: string;
  toStatus: string;
  comment?: string;
}

interface ClaimSpec {
  claimNo: string;
  title: string;
  applicant: string;
  department: string;
  status: string;
  remark?: string;
  submittedAt?: string;
  decidedAt?: string;
  paidAt?: string;
  paymentMethod?: string;
  items: readonly ItemSpec[];
  approvals: readonly ApprovalSpec[];
}

const CLAIMS: readonly ClaimSpec[] = [
  {
    claimNo: 'EX202601080001',
    title: '客户拜访差旅费 Client visit travel',
    applicant: 'zhangsan',
    department: 'engineering',
    status: 'pending_supervisor',
    submittedAt: '2026-01-08T02:30:00.000Z',
    items: [
      {
        category: 'transport',
        amount: 860,
        expenseDate: '2026-01-06',
        description: '高铁往返 Shanghai–Hangzhou',
      },
      {
        category: 'travel',
        amount: 420,
        expenseDate: '2026-01-06',
        description: '住宿一晚 Hotel, one night',
      },
    ],
    approvals: [
      {
        action: 'submit',
        operator: 'zhangsan',
        fromStatus: 'draft',
        toStatus: 'pending_supervisor',
      },
    ],
  },
  {
    claimNo: 'EX202601150002',
    title: '销售会议招待费 Sales meeting hospitality',
    applicant: 'wangwu',
    department: 'sales',
    status: 'pending_finance',
    submittedAt: '2026-01-15T06:05:00.000Z',
    decidedAt: '2026-01-16T01:20:00.000Z',
    items: [
      {
        category: 'entertainment',
        amount: 6800,
        expenseDate: '2026-01-14',
        description: '年度客户答谢晚宴 Client appreciation dinner',
      },
    ],
    approvals: [
      {
        action: 'submit',
        operator: 'wangwu',
        fromStatus: 'draft',
        toStatus: 'pending_supervisor',
      },
      {
        action: 'approve',
        operator: 'zhaoliu',
        fromStatus: 'pending_supervisor',
        toStatus: 'pending_finance',
        comment: '金额超过 5000 元，转财务复核 Over threshold, to finance',
      },
    ],
  },
  {
    claimNo: 'EX202602050003',
    title: '办公用品采购 Office supplies',
    applicant: 'zhangsan',
    department: 'engineering',
    status: 'paid',
    submittedAt: '2026-02-05T03:10:00.000Z',
    decidedAt: '2026-02-06T02:00:00.000Z',
    paidAt: '2026-02-10T08:30:00.000Z',
    paymentMethod: 'bank_transfer',
    items: [
      {
        category: 'office',
        amount: 320,
        expenseDate: '2026-02-03',
        description: '键盘与鼠标 Keyboard and mouse',
      },
      {
        category: 'transport',
        amount: 140,
        expenseDate: '2026-02-04',
        description: '样品快递费 Sample courier',
      },
    ],
    approvals: [
      {
        action: 'submit',
        operator: 'zhangsan',
        fromStatus: 'draft',
        toStatus: 'pending_supervisor',
      },
      {
        action: 'approve',
        operator: 'lisi',
        fromStatus: 'pending_supervisor',
        toStatus: 'approved',
        comment: '同意 Approve',
      },
      {
        action: 'pay',
        operator: 'qianqi',
        fromStatus: 'approved',
        toStatus: 'paid',
        comment: '已通过银行转账支付 Paid by bank transfer',
      },
    ],
  },
  {
    claimNo: 'EX202602180004',
    title: '培训报名费 Training fee',
    applicant: 'wangwu',
    department: 'sales',
    status: 'rejected',
    submittedAt: '2026-02-18T07:40:00.000Z',
    decidedAt: '2026-02-19T00:55:00.000Z',
    items: [
      {
        category: 'other',
        amount: 2300,
        expenseDate: '2026-02-17',
        description: '行业培训课程 Industry training course',
      },
    ],
    approvals: [
      {
        action: 'submit',
        operator: 'wangwu',
        fromStatus: 'draft',
        toStatus: 'pending_supervisor',
      },
      {
        action: 'reject',
        operator: 'zhaoliu',
        fromStatus: 'pending_supervisor',
        toStatus: 'rejected',
        comment:
          '发票信息不完整，请补充后重新提交 Invoice details incomplete, please resubmit',
      },
    ],
  },
  {
    claimNo: 'EX202603010005',
    title: '客户样品寄送费 Sample delivery',
    applicant: 'wangwu',
    department: 'sales',
    status: 'approved',
    submittedAt: '2026-03-01T01:15:00.000Z',
    decidedAt: '2026-03-02T03:25:00.000Z',
    items: [
      {
        category: 'transport',
        amount: 900,
        expenseDate: '2026-02-27',
        description: '样品空运至成都 Sample air freight to Chengdu',
      },
    ],
    approvals: [
      {
        action: 'submit',
        operator: 'wangwu',
        fromStatus: 'draft',
        toStatus: 'pending_supervisor',
      },
      {
        action: 'approve',
        operator: 'zhaoliu',
        fromStatus: 'pending_supervisor',
        toStatus: 'approved',
        comment: '同意 Approve',
      },
    ],
  },
  {
    claimNo: 'EX202603120006',
    title: '差旅费草稿 Draft travel',
    applicant: 'zhangsan',
    department: 'engineering',
    status: 'draft',
    remark: '待补充发票 Waiting for the invoice',
    items: [
      {
        category: 'transport',
        amount: 320,
        expenseDate: '2026-03-11',
        description: '打车费用 Taxi fare',
      },
    ],
    approvals: [],
  },
  {
    claimNo: 'EX202603200007',
    title: '市场推广费 Marketing promotion',
    applicant: 'wangwu',
    department: 'marketing',
    status: 'pending_supervisor',
    submittedAt: '2026-03-20T05:00:00.000Z',
    items: [
      {
        category: 'other',
        amount: 1200,
        expenseDate: '2026-03-18',
        description: '线上广告投放 Online ads',
      },
      {
        category: 'office',
        amount: 300,
        expenseDate: '2026-03-19',
        description: '宣传册印刷 Brochure printing',
      },
    ],
    approvals: [
      {
        action: 'submit',
        operator: 'wangwu',
        fromStatus: 'draft',
        toStatus: 'pending_supervisor',
      },
    ],
  },
];

export default defineSeed({
  name: '202610010012_expense_sample_claims',
  transaction: true,
  async run(context) {
    const { query } = context;
    // `context.repository` is a method on the context object; calling it off the object keeps `this` intact.
    const claims = context.repository<ClaimRow>('expenseClaims');
    const items = context.repository<ItemRow>('expenseItems');
    const approvals = context.repository<ApprovalRow>('expenseApprovals');
    const departments = context.repository<{
      id: string;
      code: string;
      name: string;
    }>('expenseDepartments');

    const users = await loadUsers(query);

    for (const spec of CLAIMS) {
      const existing = await claims.findOne({
        filter: { claimNo: spec.claimNo },
      });
      if (existing) {
        continue;
      }
      const applicant = users.get(spec.applicant);
      if (!applicant) {
        // The sample people are absent, so there is nothing to attribute this claim to.
        continue;
      }
      const department = await departments.findOne({
        filter: { code: spec.department },
      });
      const now = new Date();
      const createdAt = spec.submittedAt ? new Date(spec.submittedAt) : now;
      const totalAmount =
        Math.round(
          spec.items.reduce((sum, item) => sum + item.amount, 0) * 100,
        ) / 100;
      const claimId = crypto.randomUUID();

      await claims.createOne({
        values: {
          id: claimId,
          claimNo: spec.claimNo,
          title: spec.title,
          applicantId: applicant.id,
          applicantName: applicant.name,
          departmentId: department?.id ?? null,
          departmentName: department?.name ?? null,
          status: spec.status,
          totalAmount,
          remark: spec.remark ?? null,
          submittedAt: spec.submittedAt ? new Date(spec.submittedAt) : null,
          decidedAt: spec.decidedAt ? new Date(spec.decidedAt) : null,
          paidAt: spec.paidAt ? new Date(spec.paidAt) : null,
          paymentMethod: spec.paymentMethod ?? null,
          paymentRemark: null,
          createdAt,
          updatedAt: spec.paidAt ? new Date(spec.paidAt) : createdAt,
        } as ClaimRow,
      });

      for (const [index, item] of spec.items.entries()) {
        await items.createOne({
          values: {
            id: crypto.randomUUID(),
            claimId,
            category: item.category,
            amount: item.amount,
            expenseDate: new Date(`${item.expenseDate}T00:00:00.000Z`),
            description: item.description,
            invoiceId: null,
            invoiceName: null,
            invoiceExt: null,
            sortOrder: index,
            createdAt,
            updatedAt: createdAt,
          } as ItemRow,
        });
      }

      for (const approval of spec.approvals) {
        const operator = users.get(approval.operator);
        if (!operator) {
          continue;
        }
        await approvals.createOne({
          values: {
            id: crypto.randomUUID(),
            claimId,
            action: approval.action,
            operatorId: operator.id,
            operatorName: operator.name,
            fromStatus: approval.fromStatus,
            toStatus: approval.toStatus,
            comment: approval.comment ?? null,
            createdAt,
            updatedAt: createdAt,
          } as ApprovalRow,
        });
      }
    }
  },
});

async function loadUsers(
  query: QueryAdapter,
): Promise<Map<string, { id: string; name: string }>> {
  const rows = await query
    .selectFrom('user')
    .select(['id', 'name', 'username'])
    .execute<{
      id: string;
      name: string | null;
      username: string | null;
    }>();
  const result = new Map<string, { id: string; name: string }>();
  for (const row of rows) {
    const username =
      row.username === null || row.username === undefined
        ? ''
        : String(row.username);
    if (username) {
      result.set(username, {
        id: String(row.id),
        name: String(row.name ?? ''),
      });
    }
  }
  return result;
}
