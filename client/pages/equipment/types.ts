/**
 * Types shared by the equipment ledger and the borrow-record pages.
 *
 * The server never stores a "borrowed" or "overdue" flag. The ledger item
 * therefore carries the derived `status` and the open loan, and a borrow
 * record carries the derived `overdue` flag, so the two pages can never
 * disagree about a device.
 */

export const EQUIPMENT_STATUSES = ['available', 'borrowed'] as const;

export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export interface EquipmentActiveLoan {
  readonly id: number;
  readonly borrower: string;
  readonly dueAt: string;
  readonly overdue: boolean;
}

export interface EquipmentItem {
  readonly id: number;
  readonly assetNo: string;
  readonly name: string;
  readonly category: string;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: EquipmentStatus;
  readonly activeLoan: EquipmentActiveLoan | null;
}

export interface EquipmentRecord {
  readonly id: number;
  readonly assetNo: string;
  readonly name: string;
  readonly category: string;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EquipmentStats {
  readonly total: number;
  readonly borrowed: number;
  readonly overdue: number;
}

export interface LoanRecord {
  readonly id: number;
  readonly equipmentId: number;
  readonly borrower: string;
  readonly purpose: string | null;
  readonly borrowedAt: string;
  readonly dueAt: string;
  readonly returnedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LoanItem extends LoanRecord {
  readonly assetNo: string;
  readonly equipmentName: string;
  readonly overdue: boolean;
}

/** Values the create/edit form submits; the server validates them again. */
export interface EquipmentFormValues {
  readonly assetNo: string;
  readonly name: string;
  readonly category: string;
  readonly notes: string | null;
}

/** Values the borrow form submits. */
export interface BorrowFormValues {
  readonly equipmentId: number;
  readonly borrower: string;
  readonly purpose: string | null;
  readonly dueAt: string;
}
