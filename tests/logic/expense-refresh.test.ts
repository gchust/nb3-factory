import { describe, expect, it, vi } from 'vitest';

import {
  invalidateExpenseData,
  subscribeExpenseData,
} from '../../client/pages/expenses/refresh.js';

describe('expense data invalidation channel', () => {
  it('notifies a subscriber until it unsubscribes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeExpenseData(listener);

    invalidateExpenseData();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    invalidateExpenseData();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies every mounted subscriber exactly once per invalidation', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribeExpenseData(first);
    const unsubscribeSecond = subscribeExpenseData(second);

    invalidateExpenseData();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    unsubscribeSecond();
  });
});
