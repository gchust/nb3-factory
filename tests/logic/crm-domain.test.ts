import { describe, expect, it } from 'vitest';

import {
  computeFunnelStats,
  CrmError,
  optionalDate,
  parseContactInput,
  parseCustomerInput,
  parseFollowUpInput,
  parseOpportunityInput,
} from '../../server/providers/crm/domain.js';

function errorCode(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return error instanceof CrmError ? error.code : undefined;
  }
}

describe('customer input', () => {
  it('requires a company name', () => {
    expect(errorCode(() => parseCustomerInput({}, { requireName: true }))).toBe(
      'CUSTOMER_NAME_REQUIRED',
    );
  });

  it('defaults the status and trims the name', () => {
    const input = parseCustomerInput(
      { name: '  Acme  ' },
      { requireName: true },
    );
    expect(input.name).toBe('Acme');
    expect(input.status).toBe('potential');
  });

  it('rejects an unsupported source', () => {
    expect(
      errorCode(() =>
        parseCustomerInput(
          { name: 'Acme', source: 'tv' },
          { requireName: true },
        ),
      ),
    ).toBe('INVALID_SOURCE');
  });
});

describe('contact input', () => {
  it('requires a name and treats primary as a boolean', () => {
    expect(errorCode(() => parseContactInput({}, 1))).toBe(
      'CONTACT_NAME_REQUIRED',
    );
    const input = parseContactInput({ name: 'Alice', isPrimary: true }, 7);
    expect(input.customerId).toBe(7);
    expect(input.isPrimary).toBe(true);
  });
});

describe('opportunity stage rules', () => {
  it('rejects a won opportunity without a deal amount', () => {
    expect(
      errorCode(() => parseOpportunityInput({ name: 'Deal', stage: 'won' }, 1)),
    ).toBe('WON_AMOUNT_REQUIRED');
  });

  it('accepts a won opportunity with a deal amount', () => {
    const input = parseOpportunityInput(
      { name: 'Deal', stage: 'won', wonAmount: 1200 },
      1,
    );
    expect(input.wonAmount).toBe(1200);
    expect(input.lostReason).toBeNull();
  });

  it('rejects a lost opportunity without a reason', () => {
    expect(
      errorCode(() =>
        parseOpportunityInput({ name: 'Deal', stage: 'lost' }, 1),
      ),
    ).toBe('LOST_REASON_REQUIRED');
  });

  it('accepts a lost opportunity with a reason and clears the deal amount', () => {
    const input = parseOpportunityInput(
      {
        name: 'Deal',
        stage: 'lost',
        lostReason: 'Budget cut',
        wonAmount: 500,
      },
      1,
    );
    expect(input.lostReason).toBe('Budget cut');
    expect(input.wonAmount).toBeNull();
  });

  it('clears both when the stage is still open', () => {
    const input = parseOpportunityInput(
      {
        name: 'Deal',
        stage: 'following',
        wonAmount: 500,
        lostReason: 'nope',
      },
      1,
    );
    expect(input.wonAmount).toBeNull();
    expect(input.lostReason).toBeNull();
  });
});

describe('follow-up input', () => {
  it('requires a supported method and a summary', () => {
    expect(errorCode(() => parseFollowUpInput({ summary: 'x' }))).toBe(
      'INVALID_METHOD',
    );
    expect(errorCode(() => parseFollowUpInput({ method: 'phone' }))).toBe(
      'FOLLOW_UP_SUMMARY_REQUIRED',
    );
  });

  it('defaults the followed-at time', () => {
    const input = parseFollowUpInput({ method: 'email', summary: 'Ping' });
    expect(input.followedAt).toBeInstanceOf(Date);
  });
});

describe('date parsing', () => {
  it('accepts ISO strings, epoch milliseconds and epoch strings', () => {
    expect(optionalDate('2026-09-13', 'X')?.toISOString()).toContain(
      '2026-09-13',
    );
    expect(optionalDate(1_780_000_000_000, 'X')?.getTime()).toBe(
      1_780_000_000_000,
    );
    expect(optionalDate('1780000000000.0', 'X')?.getTime()).toBe(
      1_780_000_000_000,
    );
  });

  it('returns null for empty input and rejects nonsense', () => {
    expect(optionalDate('', 'X')).toBeNull();
    expect(errorCode(() => optionalDate('not-a-date', 'X'))).toBe('X');
  });
});

describe('funnel statistics', () => {
  it('counts stages, amounts, new-this-month and the win rate', () => {
    const stats = computeFunnelStats({
      byStage: [
        { stage: 'won', count: 2, total: 300 },
        { stage: 'lost', count: 1, total: 100 },
        { stage: 'lead', count: 3, total: 50 },
      ],
      newThisMonth: 4,
    });
    expect(stats.byStage.map((row) => row.stage)).toEqual([
      'lead',
      'following',
      'quoted',
      'won',
      'lost',
    ]);
    expect(stats.totalCount).toBe(6);
    expect(stats.totalAmount).toBe(450);
    expect(stats.newThisMonth).toBe(4);
    expect(stats.winRate).toBeCloseTo(2 / 3);
  });

  it('reports no win rate when no opportunity has ended', () => {
    const stats = computeFunnelStats({
      byStage: [{ stage: 'lead', count: 1, total: 10 }],
      newThisMonth: 1,
    });
    expect(stats.closedCount).toBe(0);
    expect(stats.winRate).toBeNull();
  });
});
