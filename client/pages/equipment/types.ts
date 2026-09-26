/** The derived state of one piece of equipment: available when it has no open loan. */
export type EquipmentStatus = 'available' | 'borrowed' | 'overdue';

/** The state of one borrow record. `overdue` means not returned and past the expected return date. */
export type LoanStatus = 'borrowed' | 'returned' | 'overdue';

/** The open loan of an equipment record, if any. */
export interface ActiveLoanSummary {
  readonly id: number;
  readonly borrower: string;
  readonly borrowedAt: string;
  readonly expectedReturnAt: string;
  readonly isOverdue: boolean;
}

export interface Equipment {
  readonly id: number;
  readonly assetCode: string;
  readonly name: string;
  readonly category: string | null;
  readonly notes: string | null;
  readonly status: EquipmentStatus;
  readonly activeLoan: ActiveLoanSummary | null;
  readonly createdAt: string;
}

/** The equipment snapshot embedded in a borrow record, so the record survives an equipment rename. */
export interface BorrowRecordEquipment {
  readonly id: number;
  readonly assetCode: string;
  readonly name: string;
  readonly category: string | null;
}

export interface BorrowRecord {
  readonly id: number;
  readonly equipmentId: number;
  readonly equipment: BorrowRecordEquipment | null;
  readonly borrower: string;
  readonly purpose: string | null;
  readonly borrowedAt: string;
  readonly expectedReturnAt: string;
  readonly returnedAt: string | null;
  readonly status: LoanStatus;
  readonly createdAt: string;
}

/** The create/update body for an equipment record. Empty optional text is `null`. */
export interface EquipmentPayload {
  readonly assetCode: string;
  readonly name: string;
  readonly category: string | null;
  readonly notes: string | null;
}

/** The create body for a borrow record. `expectedReturnAt` is an ISO instant at the end of the picked day. */
export interface BorrowPayload {
  readonly equipmentId: number;
  readonly borrower: string;
  readonly purpose: string | null;
  readonly expectedReturnAt: string;
}

/** What the equipment ledger passes to its create, edit and borrow child routes through `<Outlet context>`. */
export interface EquipmentOutletContext {
  /** Refresh the ledger in the background. */
  readonly reload: () => void;
}

/** What the borrow-record list passes to its create child route through `<Outlet context>`. */
export interface BorrowRecordsOutletContext {
  /** Refresh the list in the background. */
  readonly reload: () => void;
}

export const EQUIPMENT_STATUSES: readonly EquipmentStatus[] = [
  'available',
  'borrowed',
  'overdue',
];

export const LOAN_STATUSES: readonly LoanStatus[] = [
  'borrowed',
  'overdue',
  'returned',
];
