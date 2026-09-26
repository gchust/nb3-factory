/** Equipment borrowing and return — the shapes the two pages share. */

export type EquipmentStatus = 'available' | 'borrowed';

export type LoanStatus = 'active' | 'returned';

export interface Equipment {
  readonly id: number;
  readonly assetNo: string;
  readonly name: string;
  readonly category: string;
  readonly notes: string;
  readonly status: EquipmentStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Borrower of the active loan; `null` while the device is available. */
  readonly currentBorrower: string | null;
  /** Expected return of the active loan, ISO string; `null` while available. */
  readonly expectedReturnAt: string | null;
  readonly currentLoanId: number | null;
  readonly overdue: boolean;
}

export interface EquipmentStats {
  readonly total: number;
  readonly borrowed: number;
  readonly overdue: number;
}

export interface EquipmentListResponse {
  readonly items: Equipment[];
  readonly stats: EquipmentStats;
}

export interface Loan {
  readonly id: number;
  readonly equipmentId: number;
  readonly assetNo: string;
  readonly equipmentName: string;
  readonly borrower: string;
  readonly purpose: string;
  readonly borrowedAt: string;
  readonly expectedReturnAt: string;
  readonly returnedAt: string | null;
  readonly overdue: boolean;
}

export interface EquipmentFormValues {
  readonly assetNo: string;
  readonly name: string;
  readonly category: string;
  readonly notes: string;
}

export interface BorrowFormValues {
  readonly borrower: string;
  readonly purpose: string;
  readonly expectedReturnAt: Date;
}

/** What the list pages pass to their child-route overlays through `<Outlet context>`. */
export interface EquipmentOutletContext {
  /** Refreshes the page's data in the background. */
  readonly reload: () => void;
}

export interface EquipmentListQuery {
  readonly keyword?: string;
  readonly status?: EquipmentStatus;
}

export interface LoanListQuery {
  readonly keyword?: string;
  readonly status?: LoanStatus;
}
