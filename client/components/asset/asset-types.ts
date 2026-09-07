export const ASSET_TYPES = ['computer', 'monitor', 'phone', 'other'] as const;
export const ASSET_STATUSES = [
  'available',
  'inUse',
  'maintenance',
  'retired',
] as const;
export const RECORD_STATUSES = ['claimed', 'returned'] as const;

export type AssetType = (typeof ASSET_TYPES)[number];
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export interface Asset {
  id: number;
  assetNumber: string;
  name: string;
  type: string;
  brandModel: string;
  status: string;
  currentEmployeeId: number | null;
  currentEmployeeName: string | null;
  purchasedAt: string | null;
  remark: string | null;
  createdAt: string;
}

export interface AssetRecord {
  id: number;
  assetId: number;
  assetNumber: string;
  assetName: string;
  employeeId: number;
  employeeName: string;
  department: string;
  claimedAt: string;
  returnedAt: string | null;
  status: string;
  remark: string | null;
}

export interface Employee {
  id: number;
  name: string;
  department: string;
  email: string | null;
  isAdmin: boolean;
}

export interface AssetListFilters {
  type?: string;
  status?: string;
  search?: string;
}

export interface RecordListFilters {
  status?: string;
  search?: string;
  assetId?: string;
}

export interface AssetInput {
  assetNumber: string;
  name: string;
  type: string;
  brandModel: string;
  status: string;
  purchasedAt?: string | null;
  remark?: string | null;
}
