// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  buildExportCsv,
  claimCapabilities,
  computeTotalAmount,
  csvEscape,
  evaluateAction,
  exportJobProgress,
  managesDepartment,
  requiresFinanceReview,
  resolveActor,
  roundAmount,
  summarizeApprovals,
  toAmount,
  toExportRows,
  toIsoDate,
  type Actor,
} from '../../server/expense/logic.ts';
import { summarizeStats } from '../../server/expense/service.ts';
import type {
  ApprovalRecord,
  ClaimRecord,
  DepartmentRecord,
  ItemRecord,
} from '../../server/expense/model.ts';

/**
 * The domain rules of the reimbursement workflow, exercised without a database.
 *
 * These are the rules the requirements name: who approves at which amount, who may see which claim, which claims stay
 * editable, and what the dashboard adds up. The routes only translate them into HTTP.
 */

const departments: readonly DepartmentRecord[] = [
  {
    id: 'sales',
    code: 'sales',
    name: 'Sales',
    managerId: 'alice',
    parentId: null,
    sortOrder: 1,
    active: true,
  },
  {
    id: 'sales-east',
    code: 'sales-east',
    name: 'Sales East',
    managerId: null,
    parentId: 'sales',
    sortOrder: 1,
    active: true,
  },
  {
    id: 'finance',
    code: 'finance',
    name: 'Finance',
    managerId: 'frank',
    parentId: null,
    sortOrder: 2,
    active: true,
  },
  {
    id: 'hr',
    code: 'hr',
    name: 'HR',
    managerId: null,
    parentId: null,
    sortOrder: 3,
    active: false,
  },
];

function actorOf(
  userId: string,
  memberDepartmentIds: readonly string[] = [],
): Actor {
  return resolveActor(departments, memberDepartmentIds, userId, userId);
}

function claimOf(overrides: Partial<ClaimRecord> = {}): ClaimRecord {
  return {
    id: 'claim-1',
    claimNo: 'EX20260101ABCDEF',
    title: 'Client visit',
    applicantId: 'bob',
    applicantName: 'Bob',
    departmentId: 'sales',
    departmentName: 'Sales',
    status: 'draft',
    totalAmount: 100,
    remark: null,
    submittedAt: null,
    decidedAt: null,
    paidAt: null,
    paymentMethod: null,
    paymentRemark: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('expense amounts', () => {
  it('rounds to cents so a float sum cannot leak a fractional fen', () => {
    expect(roundAmount(0.1 + 0.2)).toBe(0.3);
    expect(roundAmount(1.005)).toBe(1.01);
    expect(roundAmount(Number.NaN)).toBe(0);
    // Amount columns arrive as strings from some drivers.
    expect(toAmount('1234.567')).toBe(1234.57);
    expect(toAmount(null)).toBe(0);
    expect(toAmount('not a number')).toBe(0);
  });

  it('computes the total from the lines and never from a client-supplied value', () => {
    expect(
      computeTotalAmount([
        { amount: 1200.5 },
        { amount: '300.25' },
        { amount: 0.05 },
      ]),
    ).toBe(1500.8);
    expect(computeTotalAmount([])).toBe(0);
  });

  it('needs finance review only strictly above the threshold', () => {
    expect(requiresFinanceReview(5000)).toBe(false);
    expect(requiresFinanceReview(5000.01)).toBe(true);
    expect(requiresFinanceReview(4999.99)).toBe(false);
  });
});

describe('who sees and handles which claim', () => {
  it('makes a member of the active finance department finance', () => {
    expect(actorOf('frank', ['finance']).isFinance).toBe(true);
    // A member of an inactive department is not finance: the department was switched off.
    expect(actorOf('someone', ['hr']).isFinance).toBe(false);
    expect(actorOf('frank').isFinance).toBe(false);
  });

  it('sees a claim as its applicant, as a manager of its department, or as finance', () => {
    const claim = claimOf({ status: 'pending_supervisor' });
    expect(claimCapabilities(claim, actorOf('bob')).canView).toBe(true);
    expect(claimCapabilities(claim, actorOf('carol')).canView).toBe(false);
    expect(
      claimCapabilities(claim, actorOf('frank', ['finance'])).canView,
    ).toBe(true);

    // alice manages `sales`, so she covers a claim filed in its descendant `sales-east`.
    const nested = claimOf({ departmentId: 'sales-east' });
    expect(claimCapabilities(nested, actorOf('alice')).canView).toBe(true);
    expect(claimCapabilities(nested, actorOf('dan')).canView).toBe(false);
  });

  it('walks up the department hierarchy without looping on bad data', () => {
    expect(managesDepartment(departments, 'alice', 'sales-east')).toBe(true);
    expect(managesDepartment(departments, 'alice', null)).toBe(false);
    expect(managesDepartment(departments, 'alice', 'missing')).toBe(false);
    // A cycle in the parent links cannot hang the walk.
    const cyclic: readonly DepartmentRecord[] = [
      {
        id: 'a',
        code: 'a',
        name: 'A',
        managerId: null,
        parentId: 'b',
        sortOrder: 1,
        active: true,
      },
      {
        id: 'b',
        code: 'b',
        name: 'B',
        managerId: null,
        parentId: 'a',
        sortOrder: 1,
        active: true,
      },
    ];
    expect(managesDepartment(cyclic, 'alice', 'a')).toBe(false);
  });

  it('never lets the applicant approve their own claim', () => {
    // alice manages `sales` and files a claim into it: she is both, and the manager side must not win.
    const own = claimOf({
      applicantId: 'alice',
      departmentId: 'sales',
      status: 'pending_supervisor',
    });
    const capabilities = claimCapabilities(own, actorOf('alice'));
    expect(capabilities.canApprove).toBe(false);
    expect(capabilities.canReject).toBe(false);
    // She may still edit and resubmit her own claim while it is hers to change.
    const ownDraft = claimOf({
      applicantId: 'alice',
      departmentId: 'sales',
      status: 'draft',
    });
    expect(claimCapabilities(ownDraft, actorOf('alice')).canEdit).toBe(true);
  });

  it('keeps a claim editable only before review and after a rejection', () => {
    for (const status of ['draft', 'rejected'] as const) {
      expect(
        claimCapabilities(claimOf({ status }), actorOf('bob')).canEdit,
      ).toBe(true);
    }
    for (const status of [
      'pending_supervisor',
      'pending_finance',
      'approved',
      'paid',
    ] as const) {
      expect(
        claimCapabilities(claimOf({ status }), actorOf('bob')).canEdit,
      ).toBe(false);
    }
  });

  it('refuses every change to a paid claim', () => {
    const paid = claimOf({ status: 'paid' });
    const owner = claimCapabilities(paid, actorOf('bob'));
    const manager = claimCapabilities(paid, actorOf('alice'));
    const finance = claimCapabilities(paid, actorOf('frank', ['finance']));
    for (const capabilities of [owner, manager, finance]) {
      expect(capabilities.canEdit).toBe(false);
      expect(capabilities.canSubmit).toBe(false);
      expect(capabilities.canApprove).toBe(false);
      expect(capabilities.canReject).toBe(false);
      expect(capabilities.canPay).toBe(false);
    }
  });

  it('lets a manager delete nothing and the owner delete only a draft', () => {
    expect(
      claimCapabilities(claimOf({ status: 'draft' }), actorOf('bob')).canDelete,
    ).toBe(true);
    expect(
      claimCapabilities(claimOf({ status: 'rejected' }), actorOf('bob'))
        .canDelete,
    ).toBe(false);
    expect(
      claimCapabilities(claimOf({ status: 'draft' }), actorOf('alice'))
        .canDelete,
    ).toBe(false);
  });
});

describe('the approval state machine', () => {
  const decide = (
    action: 'submit' | 'approve' | 'reject' | 'pay',
    claim: ClaimRecord,
    actor: Actor,
    extra: { hasItems?: boolean; comment?: string | null } = {},
  ) =>
    evaluateAction({
      action,
      claim,
      actor,
      capabilities: claimCapabilities(claim, actor),
      ...extra,
    });

  it('submits to the supervisor, then straight to approved when the total is small', () => {
    const submitted = decide(
      'submit',
      claimOf({ status: 'draft', totalAmount: 5000 }),
      actorOf('bob'),
    );
    expect(submitted).toEqual({ ok: true, toStatus: 'pending_supervisor' });

    const approved = decide(
      'approve',
      claimOf({ status: 'pending_supervisor', totalAmount: 5000 }),
      actorOf('alice'),
    );
    expect(approved).toEqual({ ok: true, toStatus: 'approved' });
  });

  it('adds the finance review step when the total is above the threshold', () => {
    const reviewed = decide(
      'approve',
      claimOf({ status: 'pending_supervisor', totalAmount: 5000.01 }),
      actorOf('alice'),
    );
    expect(reviewed).toEqual({ ok: true, toStatus: 'pending_finance' });

    const financeApproved = decide(
      'approve',
      claimOf({ status: 'pending_finance', totalAmount: 5000.01 }),
      actorOf('frank', ['finance']),
    );
    expect(financeApproved).toEqual({ ok: true, toStatus: 'approved' });
  });

  it('pays only an approved claim, and only from finance', () => {
    const approved = claimOf({ status: 'approved' });
    expect(decide('pay', approved, actorOf('frank', ['finance']))).toEqual({
      ok: true,
      toStatus: 'paid',
    });
    expect(decide('pay', approved, actorOf('alice'))).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    // An unapproved claim cannot be paid even by finance.
    expect(
      decide(
        'pay',
        claimOf({ status: 'pending_finance' }),
        actorOf('frank', ['finance']),
      ),
    ).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('refuses an approval from someone who does not manage the department', () => {
    const pending = claimOf({ status: 'pending_supervisor' });
    expect(decide('approve', pending, actorOf('carol'))).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(
      decide('reject', pending, actorOf('carol'), { comment: 'no' }),
    ).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('demands a reason before a rejection is recorded', () => {
    const pending = claimOf({ status: 'pending_supervisor' });
    expect(decide('reject', pending, actorOf('alice'))).toEqual({
      ok: false,
      reason: 'comment_required',
    });
    expect(
      decide('reject', pending, actorOf('alice'), { comment: '   ' }),
    ).toEqual({
      ok: false,
      reason: 'comment_required',
    });
    expect(
      decide('reject', pending, actorOf('alice'), {
        comment: 'Invoice does not match the amount',
      }),
    ).toEqual({
      ok: true,
      toStatus: 'rejected',
    });
  });

  it('refuses to submit a claim with no expense line', () => {
    expect(
      decide('submit', claimOf({ status: 'draft' }), actorOf('bob'), {
        hasItems: false,
      }),
    ).toEqual({
      ok: false,
      reason: 'empty_claim',
    });
  });

  it('lets a rejected claim be resubmitted from the beginning', () => {
    const rejected = claimOf({ status: 'rejected' });
    expect(decide('submit', rejected, actorOf('bob'))).toEqual({
      ok: true,
      toStatus: 'pending_supervisor',
    });
  });
});

describe('the export CSV', () => {
  const items: readonly ItemRecord[] = [
    {
      id: 'item-1',
      claimId: 'claim-1',
      category: 'travel',
      amount: 1200.5,
      expenseDate: new Date('2026-01-02T00:00:00.000Z'),
      description: 'Flight',
      invoiceId: null,
      invoiceName: null,
      invoiceExt: null,
      invoiceType: null,
      sortOrder: 0,
    },
  ];
  const approvals: readonly ApprovalRecord[] = [
    {
      id: 'approval-1',
      claimId: 'claim-1',
      action: 'approve',
      operatorId: 'alice',
      operatorName: 'Alice',
      fromStatus: 'pending_supervisor',
      toStatus: 'approved',
      comment: 'ok',
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
    },
  ];

  it('quotes only the cells that need it', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('with, comma')).toBe('"with, comma"');
    expect(csvEscape('a "quote"')).toBe('"a ""quote"""');
    expect(csvEscape(null)).toBe('');
  });

  it('writes a BOM, one line per expense, and the approval history', () => {
    const csv = buildExportCsv(
      toExportRows(claimOf({ status: 'approved' }), items, approvals),
    );
    expect(csv.startsWith('\uFEFF')).toBe(true);
    // A header plus one row, CRLF separated as the CSV spec asks.
    expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv).toContain('1200.50');
    expect(csv).toContain('approve:Alice(ok)');
  });

  it('still writes one row for a claim with no expenses', () => {
    const rows = toExportRows(claimOf(), [], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.category).toBe('');
    expect(rows[0]?.amount).toBe(0);
  });

  it('renders dates as ISO strings and joins the history in order', () => {
    expect(toIsoDate(new Date('2026-01-02T03:04:05.000Z'))).toBe('2026-01-02');
    expect(toIsoDate(null)).toBe(null);
    expect(summarizeApprovals([])).toBe('');
    expect(summarizeApprovals(approvals)).toBe('approve:Alice(ok)');
  });

  it('reports progress that only reaches 100 on completion', () => {
    const base = {
      id: 'job',
      requesterId: 'bob',
      filter: null,
      resultFilename: null,
      resultSize: 0,
      error: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      resultContent: null,
    };
    expect(
      exportJobProgress({ ...base, status: 'pending', total: 0, processed: 0 }),
    ).toBe(0);
    expect(
      exportJobProgress({ ...base, status: 'running', total: 0, processed: 0 }),
    ).toBe(5);
    expect(
      exportJobProgress({
        ...base,
        status: 'running',
        total: 10,
        processed: 5,
      }),
    ).toBe(50);
    // 99 is the ceiling while it runs, so only `completed` can show a finished bar.
    expect(
      exportJobProgress({
        ...base,
        status: 'running',
        total: 10,
        processed: 10,
      }),
    ).toBe(99);
    expect(
      exportJobProgress({
        ...base,
        status: 'completed',
        total: 10,
        processed: 10,
      }),
    ).toBe(100);
  });
});

describe('the dashboard statistics', () => {
  it('sums by month, by department and by status over the claims it is given', () => {
    const stats = summarizeStats([
      claimOf({
        id: 'a',
        status: 'paid',
        totalAmount: 1000,
        submittedAt: new Date('2026-01-15T00:00:00.000Z'),
      }),
      claimOf({
        id: 'b',
        status: 'pending_supervisor',
        totalAmount: 500,
        submittedAt: new Date('2026-01-20T00:00:00.000Z'),
      }),
      claimOf({
        id: 'c',
        status: 'rejected',
        totalAmount: 300,
        departmentId: null,
        departmentName: null,
        submittedAt: new Date('2026-02-02T00:00:00.000Z'),
      }),
    ]);

    expect(stats.totals).toEqual({
      count: 3,
      totalAmount: 1800,
      paidAmount: 1000,
      // A claim under review or approved is awaiting a decision; a rejected one is not.
      pendingAmount: 500,
      rejectedCount: 1,
    });
    expect(stats.byMonth.map((bucket) => bucket.month)).toEqual([
      '2026-01',
      '2026-02',
    ]);
    expect(stats.byMonth[0]).toMatchObject({
      count: 2,
      totalAmount: 1500,
      paidAmount: 1000,
    });
    // Largest first, so the chart's biggest bar is on top.
    expect(stats.byDepartment[0]).toMatchObject({
      departmentName: 'Sales',
      totalAmount: 1500,
    });
    expect(stats.byDepartment[1]).toMatchObject({
      departmentId: null,
      departmentName: '—',
      totalAmount: 300,
    });
    // Every status is present even when nothing is in it, so the card row does not change shape.
    expect(stats.byStatus.map((bucket) => bucket.status)).toEqual([
      'draft',
      'pending_supervisor',
      'pending_finance',
      'approved',
      'rejected',
      'paid',
    ]);
    expect(
      stats.byStatus.find((bucket) => bucket.status === 'draft'),
    ).toMatchObject({ count: 0, totalAmount: 0 });
  });

  it('falls back to the creation month when a claim was never submitted', () => {
    const stats = summarizeStats([
      claimOf({
        status: 'draft',
        totalAmount: 100,
        submittedAt: null,
        createdAt: new Date('2026-03-09T00:00:00.000Z'),
      }),
    ]);
    expect(stats.byMonth.map((bucket) => bucket.month)).toEqual(['2026-03']);
  });
});
