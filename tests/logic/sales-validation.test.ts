import { describe, expect, it } from 'vitest';

import {
  contactInputSchema,
  customerInputSchema,
  customerUpdateSchema,
  opportunityInputSchema,
  opportunityUpdateSchema,
  validationErrorBody,
} from '../../server/routes/sales-schema.js';

describe('sales input schemas', () => {
  it('accepts a customer with just a name and defaults a missing industry to null', () => {
    const parsed = customerInputSchema.parse({ name: 'Acme' });
    expect(parsed).toEqual({ name: 'Acme', industry: null });
  });

  it('trims the text and turns an empty industry into null', () => {
    const parsed = customerInputSchema.parse({
      name: '  Acme  ',
      industry: '   ',
    });
    expect(parsed).toEqual({ name: 'Acme', industry: null });
  });

  it('rejects an empty customer name', () => {
    const parsed = customerInputSchema.safeParse({ name: '   ' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(['name']);
    }
  });

  it('accepts a partial customer update', () => {
    expect(customerUpdateSchema.safeParse({ industry: 'Retail' }).success).toBe(
      true,
    );
  });

  it('rejects a contact missing its name and customer', () => {
    const parsed = contactInputSchema.safeParse({ phone: '123' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path[0])).toEqual([
        'name',
        'customerId',
      ]);
    }
  });

  it('coerces a numeric string amount', () => {
    const parsed = opportunityInputSchema.parse({
      name: 'Upgrade',
      customerId: '1',
      amount: '1200.50',
      stage: 'following',
    });
    expect(parsed.amount).toBe(1200.5);
    expect(parsed.customerId).toBe(1);
  });

  it('accepts zero, the smallest allowed amount', () => {
    const parsed = opportunityInputSchema.safeParse({
      name: 'Free pilot',
      customerId: 1,
      amount: 0,
      stage: 'following',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a negative amount', () => {
    const parsed = opportunityInputSchema.safeParse({
      name: 'Refund',
      customerId: 1,
      amount: -0.01,
      stage: 'lost',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(['amount']);
    }
  });

  it('rejects an amount that is not a number', () => {
    const parsed = opportunityInputSchema.safeParse({
      name: 'Upgrade',
      customerId: 1,
      amount: 'not a number',
      stage: 'following',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(['amount']);
    }
  });

  it('accepts the three stages and rejects anything else', () => {
    for (const stage of ['following', 'won', 'lost']) {
      const parsed = opportunityInputSchema.safeParse({
        name: 'Deal',
        customerId: 1,
        amount: 1,
        stage,
      });
      expect(parsed.success).toBe(true);
    }
    expect(
      opportunityInputSchema.safeParse({
        name: 'Deal',
        customerId: 1,
        amount: 1,
        stage: 'negotiating',
      }).success,
    ).toBe(false);
  });

  it('accepts a partial opportunity update and still validates the amount', () => {
    expect(opportunityUpdateSchema.safeParse({}).success).toBe(true);
    expect(opportunityUpdateSchema.safeParse({ amount: -5 }).success).toBe(
      false,
    );
  });

  it('builds a body the client can map onto fields', () => {
    const parsed = opportunityInputSchema.safeParse({
      name: 'Deal',
      customerId: 1,
      amount: -5,
      stage: 'following',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const body = validationErrorBody(parsed.error);
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.errors).toHaveLength(1);
      expect(body.errors[0]?.path).toEqual(['amount']);
      expect(typeof body.errors[0]?.message).toBe('string');
    }
  });
});
