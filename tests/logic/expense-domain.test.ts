import { describe, expect, it } from 'vitest';

import {
  ExpenseError,
  assertPaymentDate,
  assertRejectReason,
  assertTransition,
  claimCapabilities,
  computeTotalCents,
  formatClaimNumber,
  isEditableStatus,
  monthOf,
  normalizeClaimInput,
  rolesFromPermissionSets,
} from '../../server/providers/expense-domain.js';

const items = [
  { category: 'travel', amountCents: 120000, remark: 'air' },
  { category: 'meal', amountCents: 30000, remark: null },
];

describe('expense domain', () => {
  it('derives no total and rejects a claim without items', () => {
    expect(() =>
      normalizeClaimInput({
        reason: 'trip',
        expenseDate: '2026-09-01',
        items: [],
      }),
    ).toThrowError(/At least one expense item/);
  });

  it('computes the total from the items rather than accepting a client value', () => {
    const normalized = normalizeClaimInput({
      reason: 'trip',
      expenseDate: '2026-09-01',
      items,
      totalCents: 999999,
    });
    expect(computeTotalCents(normalized.items)).toBe(150000);
    expect(normalized).not.toHaveProperty('totalCents');
  });

  it('rejects unknown categories and non-positive amounts', () => {
    expect(() =>
      normalizeClaimInput({
        reason: 'trip',
        expenseDate: '2026-09-01',
        items: [{ category: 'crypto', amountCents: 100 }],
      }),
    ).toThrowError(/unknown category/);
    expect(() =>
      normalizeClaimInput({
        reason: 'trip',
        expenseDate: '2026-09-01',
        items: [{ category: 'meal', amountCents: 0 }],
      }),
    ).toThrowError(/positive/);
  });

  it('rejects a missing reason and an invalid date', () => {
    expect(() =>
      normalizeClaimInput({ reason: '  ', expenseDate: '2026-09-01', items }),
    ).toThrowError(/reason is required/);
    expect(() =>
      normalizeClaimInput({ reason: 'trip', expenseDate: '09/01/2026', items }),
    ).toThrowError(/valid date/);
  });

  it('only treats pending and rejected claims as editable', () => {
    expect(isEditableStatus('pending')).toBe(true);
    expect(isEditableStatus('rejected')).toBe(true);
    expect(isEditableStatus('approved')).toBe(false);
    expect(isEditableStatus('paid')).toBe(false);
  });

  it('enforces the status machine', () => {
    assertTransition('pending', 'approve');
    assertTransition('approved', 'review');
    assertTransition('approved', 'pay');
    assertTransition('pending_payment', 'pay');
    expect(() => assertTransition('approved', 'approve')).toThrowError(
      ExpenseError,
    );
    expect(() => assertTransition('paid', 'reject')).toThrowError(ExpenseError);
    expect(() => assertTransition('pending', 'review')).toThrowError(
      ExpenseError,
    );
  });

  it('requires a rejection reason and a valid payment date', () => {
    expect(assertRejectReason('duplicate')).toBe('duplicate');
    expect(() => assertRejectReason('   ')).toThrowError(/rejection reason/);
    expect(assertPaymentDate('2026-09-20')).toBe('2026-09-20');
    expect(() => assertPaymentDate('')).toThrowError(/payment date/);
  });

  it('maps permission sets to roles and defaults to employee', () => {
    expect([
      ...rolesFromPermissionSets(['system-administrator'], false),
    ]).toEqual(['admin']);
    expect([...rolesFromPermissionSets(['expense-finance'], false)]).toEqual([
      'finance',
    ]);
    expect([...rolesFromPermissionSets([], true)]).toEqual(['manager']);
    expect([...rolesFromPermissionSets([], false)]).toEqual(['employee']);
  });

  it('describes per-claim capabilities for each role and status', () => {
    const admin = claimCapabilities({
      status: 'approved',
      viewer: new Set(['admin']),
      isApplicant: false,
      managesDepartment: false,
    });
    expect(admin).toMatchObject({
      canEdit: false,
      canOpenEditor: true,
      canPay: true,
      canReview: true,
      canApprove: false,
    });

    const owner = claimCapabilities({
      status: 'rejected',
      viewer: new Set(['employee']),
      isApplicant: true,
      managesDepartment: false,
    });
    expect(owner.canEdit).toBe(true);
    expect(owner.canOpenEditor).toBe(true);
    expect(owner.canApprove).toBe(false);
    expect(owner.canPay).toBe(false);

    const locked = claimCapabilities({
      status: 'paid',
      viewer: new Set(['employee']),
      isApplicant: true,
      managesDepartment: false,
    });
    expect(locked.canEdit).toBe(false);
    expect(locked.canOpenEditor).toBe(true);
    expect(locked.canDelete).toBe(false);

    const manager = claimCapabilities({
      status: 'pending',
      viewer: new Set(['manager']),
      isApplicant: false,
      managesDepartment: true,
    });
    expect(manager.canApprove).toBe(true);
    expect(manager.canEdit).toBe(false);

    const otherManager = claimCapabilities({
      status: 'pending',
      viewer: new Set(['manager']),
      isApplicant: false,
      managesDepartment: false,
    });
    expect(otherManager.canApprove).toBe(false);
  });

  it('formats claim numbers and month keys deterministically', () => {
    expect(formatClaimNumber('2026-09-05', 3)).toBe('BX-20260905-0003');
    expect(monthOf('2026-09-05')).toBe('2026-09');
  });
});
