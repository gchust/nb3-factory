import { describe, expect, it } from 'vitest';

import {
  assertReceivable,
  describeCapabilities,
  normalizeRequestItems,
  orderStatusFor,
  ProcurementError,
  roundMoney,
} from '../../server/providers/procurement.js';

describe('normalizeRequestItems', () => {
  it('computes each line amount and the request total from quantity and unit price', () => {
    const { items, totalAmount } = normalizeRequestItems([
      {
        materialName: 'A4 复印纸',
        specification: '70g',
        quantity: 100,
        unitPrice: 12.5,
      },
      { materialName: '激光硒鼓', quantity: 10, unitPrice: 220 },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0].amount).toBe(1250);
    expect(items[1].amount).toBe(2200);
    expect(totalAmount).toBe(3450);
    expect(totalAmount).toBe(items.reduce((sum, item) => sum + item.amount, 0));
  });

  it('rounds amounts to two decimals', () => {
    const { items, totalAmount } = normalizeRequestItems([
      { materialName: 'Cable', quantity: 3, unitPrice: 0.335 },
    ]);
    expect(items[0].amount).toBe(1.01);
    expect(totalAmount).toBe(1.01);
  });

  it('rejects an empty item list', () => {
    expect(() => normalizeRequestItems([])).toThrow(ProcurementError);
  });

  it('rejects a non-positive quantity', () => {
    expect(() =>
      normalizeRequestItems([{ materialName: 'A', quantity: 0, unitPrice: 1 }]),
    ).toThrow(/quantity/i);
  });

  it('rejects a negative unit price', () => {
    expect(() =>
      normalizeRequestItems([
        { materialName: 'A', quantity: 1, unitPrice: -1 },
      ]),
    ).toThrow(/unit price/i);
  });

  it('rejects a blank material name', () => {
    expect(() =>
      normalizeRequestItems([
        { materialName: '  ', quantity: 1, unitPrice: 1 },
      ]),
    ).toThrow(/name/i);
  });
});

describe('order receipts', () => {
  it('derives the order status from the cumulative quantity', () => {
    expect(orderStatusFor(110, 0)).toBe('ordered');
    expect(orderStatusFor(110, 60)).toBe('partial');
    expect(orderStatusFor(110, 110)).toBe('received');
  });

  it('rejects a receipt larger than the remaining quantity', () => {
    try {
      assertReceivable(110, 60, 60);
      throw new Error('expected assertReceivable to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ProcurementError);
      expect((error as ProcurementError).code).toBe('RECEIPT_EXCEEDS_ORDER');
      expect((error as ProcurementError).status).toBe(409);
    }
  });

  it('allows a receipt that exactly consumes the remainder', () => {
    expect(() => assertReceivable(110, 60, 50)).not.toThrow();
  });

  it('rejects a non-positive receipt', () => {
    expect(() => assertReceivable(110, 60, 0)).toThrow(/greater than zero/i);
  });
});

describe('describeCapabilities', () => {
  it('gives an administrator every capability', () => {
    const capabilities = describeCapabilities(['system-administrator']);
    expect(capabilities.isAdministrator).toBe(true);
    expect(capabilities.canApprove).toBe(true);
    expect(capabilities.manageSuppliers).toBe(true);
    expect(capabilities.manageOrders).toBe(true);
    expect(capabilities.viewAllRequests).toBe(true);
  });

  it('lets a manager approve but not maintain orders', () => {
    const capabilities = describeCapabilities(['procurement-manager']);
    expect(capabilities.canApprove).toBe(true);
    expect(capabilities.manageOrders).toBe(false);
    expect(capabilities.manageSuppliers).toBe(false);
    expect(capabilities.viewAllRequests).toBe(true);
  });

  it('lets a buyer maintain suppliers and orders but not approve', () => {
    const capabilities = describeCapabilities(['procurement-buyer']);
    expect(capabilities.canApprove).toBe(false);
    expect(capabilities.manageSuppliers).toBe(true);
    expect(capabilities.manageOrders).toBe(true);
  });

  it('treats an ordinary employee as owning only their requests', () => {
    const capabilities = describeCapabilities(['procurement-employee']);
    expect(capabilities.canApprove).toBe(false);
    expect(capabilities.manageSuppliers).toBe(false);
    expect(capabilities.manageOrders).toBe(false);
    expect(capabilities.viewAllRequests).toBe(false);
  });
});

describe('roundMoney', () => {
  it('rounds half up to two decimals', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(3450)).toBe(3450);
  });
});
