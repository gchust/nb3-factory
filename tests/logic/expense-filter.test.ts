import type { ExpressionBuilder } from '@nocobase/db';
import { describe, expect, it } from 'vitest';

import { compileFilter } from '../../server/providers/expense-service.js';

interface Comparison {
  readonly kind: 'cmp';
  readonly field: string;
  readonly operator: string;
  readonly value: unknown;
}

interface Logical {
  readonly kind: 'and' | 'or';
  readonly list: readonly unknown[];
}

function createExpressionBuilder(): ExpressionBuilder {
  const builder = (
    field: string,
    operator: string,
    value: unknown,
  ): Comparison => ({ kind: 'cmp', field, operator, value });
  const target = builder as unknown as Record<string, unknown>;
  target.and = (list: readonly unknown[]): Logical => ({ kind: 'and', list });
  target.or = (list: readonly unknown[]): Logical => ({ kind: 'or', list });
  return builder as unknown as ExpressionBuilder;
}

function collectComparisons(
  node: unknown,
  found: Comparison[] = [],
): Comparison[] {
  if (!node || typeof node !== 'object') return found;
  const candidate = node as { kind?: string; list?: readonly unknown[] };
  if (candidate.kind === 'cmp') {
    found.push(node as Comparison);
    return found;
  }
  for (const child of candidate.list ?? []) collectComparisons(child, found);
  return found;
}

function collectLogicalKinds(node: unknown, found: string[] = []): string[] {
  if (!node || typeof node !== 'object') return found;
  const candidate = node as { kind?: string; list?: readonly unknown[] };
  if (candidate.kind === 'and' || candidate.kind === 'or') {
    found.push(candidate.kind);
  }
  for (const child of candidate.list ?? []) collectLogicalKinds(child, found);
  return found;
}

describe('compileFilter', () => {
  it('maps each supported operator to the query builder comparison', () => {
    const eb = createExpressionBuilder();
    const compiled = compileFilter(eb, {
      $and: [
        { amount: { $gte: 100 } },
        { status: { $in: ['draft', 'pending'] } },
      ],
    });

    expect(collectComparisons(compiled)).toEqual([
      { kind: 'cmp', field: 'amount', operator: '>=', value: 100 },
      {
        kind: 'cmp',
        field: 'status',
        operator: 'in',
        value: ['draft', 'pending'],
      },
    ]);
    // An $and-only filter must not introduce a disjunction that would widen the result.
    expect(collectLogicalKinds(compiled)).not.toContain('or');
  });

  it('keeps $or as a disjunction so a record matching either scope is visible', () => {
    const eb = createExpressionBuilder();
    const compiled = compileFilter(eb, {
      $or: [
        { applicantId: { $eq: 'alice' } },
        { departmentId: { $in: [1, 2] } },
      ],
    });

    expect(collectLogicalKinds(compiled)).toContain('or');
    expect(collectComparisons(compiled)).toEqual([
      { kind: 'cmp', field: 'applicantId', operator: '=', value: 'alice' },
      { kind: 'cmp', field: 'departmentId', operator: 'in', value: [1, 2] },
    ]);
  });

  it('rejects an unknown operator rather than silently dropping the condition', () => {
    const eb = createExpressionBuilder();
    expect(() =>
      compileFilter(eb, { applicantId: { $regex: 'alice' } } as never),
    ).toThrowError(/Unknown filter operator/u);
  });

  it('rejects a malformed logical node', () => {
    const eb = createExpressionBuilder();
    expect(() =>
      compileFilter(eb, { $and: 'not-an-array' } as never),
    ).toThrowError(/\$and must be an array/u);
  });
});
