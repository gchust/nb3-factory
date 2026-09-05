export type EquipmentStatus = 'available' | 'borrowed' | 'repairing';

export interface EquipmentListItem {
  id: number;
  name: string;
  assetNumber: string;
  category: string;
  status: EquipmentStatus;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  openBorrowRecordId: number | null;
  openBorrowRecordBorrowerId: string | null;
  canBorrow: boolean;
  canMaintain: boolean;
  canReturn: boolean;
}

export interface BorrowRecordItem {
  id: number;
  equipmentId: number;
  borrowerId: string;
  borrowerName: string;
  borrowedAt: string;
  returnedAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  equipmentName: string | null;
  assetNumber: string | null;
  canReturn: boolean;
}

export interface EquipmentCreatePayload {
  name: string;
  assetNumber: string;
  category: string;
  description?: string | null;
}

export interface EquipmentUpdatePayload {
  name?: string;
  assetNumber?: string;
  category?: string;
  status?: 'available' | 'repairing';
  description?: string | null;
}

export interface BorrowCreatePayload {
  equipmentId: number;
  note?: string | null;
}

export interface BorrowReturnPayload {
  note?: string | null;
}
