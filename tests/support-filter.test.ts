import type { DatabaseFilter } from '@nocobase/app-plugin-authorization';
import type { ExpressionBuilder } from '@nocobase/db';
import { describe, expect, it } from 'vitest';

import {
  compileDatabaseFilter,
  containsNoRecordsFilter,
} from '../server/providers/support/filter.js';

interface Comparison {
  readonly kind: 'comparison';
  readonly field: string;
  readonly operator: string;
  readonly value: unknown;
}

interface Group {
  readonly kind: 'and' | 'or';
  readonly items: readonly Node[];
}

type Node = Comparison | Group;

function createBuilder(): ExpressionBuilder {
  const builder = ((field: string, operator: string, value: unknown): Node => ({
    kind: 'comparison',
    field,
    operator,
    value,
  })) as unknown as ExpressionBuilder;
  const withGroups = builder as unknown as {
    and(items: readonly unknown[]): Node;
    or(items: readonly unknown[]): Node;
  };
  withGroups.and = (items) => ({ kind: 'and', items: items as Node[] });
  withGroups.or = (items) => ({ kind: 'or', items: items as Node[] });
  return builder as ExpressionBuilder;
}

function compile(filter: DatabaseFilter): Node {
  return compileDatabaseFilter(createBuilder(), filter) as unknown as Node;
}

function comparisons(node: Node): Comparison[] {
  if (node.kind === 'comparison') return [node];
  return node.items.flatMap((item) => comparisons(item));
}

describe('compileDatabaseFilter', () => {
  it('translates an equality filter into a qualified comparison', () => {
    const node = compile({ $and: [{ customerId: { $eq: 'alice' } }] });
    expect(comparisons(node)).toEqual([
      {
        kind: 'comparison',
        field: 'customerId',
        operator: '=',
        value: 'alice',
      },
    ]);
  });

  it('treats an empty $and as no restriction', () => {
    expect(comparisons(compile({ $and: [] }))).toEqual([]);
  });

  it('translates $in and $gt inside an $or', () => {
    const node = compile({
      $or: [{ status: { $in: ['new', 'closed'] } }, { priority: { $gt: 2 } }],
    });
    expect(comparisons(node)).toEqual([
      {
        kind: 'comparison',
        field: 'status',
        operator: 'in',
        value: ['new', 'closed'],
      },
      { kind: 'comparison', field: 'priority', operator: '>', value: 2 },
    ]);
  });

  it('refuses an empty $or instead of compiling it to no condition', () => {
    expect(() => compile({ $or: [] })).toThrow('matches no records');
  });

  it('rejects an unsupported operator', () => {
    expect(() =>
      compile({ $and: [{ status: { $regex: 'x' } }] } as never),
    ).toThrow('Unknown filter operator');
  });
});

describe('containsNoRecordsFilter', () => {
  it('recognises the deny-everything filter', () => {
    expect(containsNoRecordsFilter({ $or: [] })).toBe(true);
    expect(containsNoRecordsFilter({ $and: [{ $or: [] }] })).toBe(true);
  });

  it('accepts a real restriction', () => {
    expect(
      containsNoRecordsFilter({ $and: [{ customerId: { $eq: 'alice' } }] }),
    ).toBe(false);
    expect(containsNoRecordsFilter({ $and: [] })).toBe(false);
  });
});
