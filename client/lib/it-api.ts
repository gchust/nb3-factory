import { apiClientToken, useService } from '@nocobase/app-client';
import { useMemo } from 'react';

/**
 * Thin, typed wrappers over this application's `/api/it/*` endpoints.
 *
 * They exist so pages never hand-build URLs and so a response envelope stays typed in one place.
 */

export type ItRole = 'administrator' | 'engineer' | 'employee';

export interface ItFile {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  /** Decorated by the file repository on upload; not persisted. */
  readonly contentUrl?: string;
}

export interface ItAssignment {
  readonly id: number;
  readonly assetId: number;
  readonly assetCode: string | null;
  readonly assetName: string | null;
  readonly employeeName: string;
  readonly assignedAt: string | null;
  readonly returnedAt: string | null;
  readonly note: string | null;
}

export interface ItAsset {
  readonly id: number;
  readonly assetCode: string;
  readonly name: string;
  readonly category: string;
  readonly brandModel: string | null;
  readonly purchaseDate: string | null;
  readonly purchaseAmount: number | null;
  readonly status: string;
  readonly currentHolder: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly files: readonly ItFile[];
  readonly openAssignment: ItAssignment | null;
}

export interface ItWorkOrderLog {
  readonly id: number;
  readonly workOrderId: number;
  readonly content: string;
  readonly authorName: string;
  readonly createdAt: string | null;
}

export interface ItWorkOrder {
  readonly id: number;
  readonly orderNo: string;
  readonly reporterName: string;
  readonly reporterId: string;
  readonly assetId: number | null;
  readonly assetCode: string | null;
  readonly assetName: string | null;
  readonly location: string | null;
  readonly description: string;
  readonly priority: string;
  readonly status: string;
  readonly assignee: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly files: readonly ItFile[];
  readonly logs: readonly ItWorkOrderLog[];
}

export interface ItDashboard {
  readonly assetsByStatus: Readonly<Record<string, number>>;
  readonly workOrdersByPriority: Readonly<Record<string, number>>;
  readonly completedWorkOrders: number;
  readonly averageCompletionHours: number | null;
}

export interface ItMe {
  readonly id: string;
  readonly name: string;
  readonly role: ItRole;
  readonly canManageAssets: boolean;
  readonly canHandleWorkOrders: boolean;
}

export interface AssetInput {
  readonly assetCode: string;
  readonly name: string;
  readonly category: string;
  readonly brandModel: string | null;
  readonly purchaseDate: string | null;
  readonly purchaseAmount: number | null;
  readonly status: string;
  readonly currentHolder: string | null;
  readonly fileIds: readonly string[];
}

export interface AssignmentInput {
  readonly assetId: number;
  readonly employeeName: string;
  readonly assignedAt: string | null;
  readonly note: string | null;
}

export interface WorkOrderInput {
  readonly assetId: number | null;
  readonly location: string | null;
  readonly description: string;
  readonly priority: string;
  readonly fileIds: readonly string[];
}

type Envelope<T> = { readonly data: T };

export interface ItApi {
  me(): Promise<ItMe>;
  listAssets(filter?: {
    category?: string;
    status?: string;
    search?: string;
  }): Promise<readonly ItAsset[]>;
  createAsset(input: AssetInput): Promise<ItAsset>;
  updateAsset(id: number, input: AssetInput): Promise<ItAsset>;
  deleteAsset(id: number): Promise<void>;
  listAssignments(assetId?: number): Promise<readonly ItAssignment[]>;
  createAssignment(input: AssignmentInput): Promise<ItAssignment>;
  returnAssignment(
    id: number,
    returnedAt?: string | null,
  ): Promise<ItAssignment>;
  listWorkOrders(): Promise<readonly ItWorkOrder[]>;
  createWorkOrder(input: WorkOrderInput): Promise<ItWorkOrder>;
  getWorkOrder(id: number): Promise<ItWorkOrder>;
  transitionWorkOrder(id: number, status: string): Promise<ItWorkOrder>;
  addWorkOrderLog(id: number, content: string): Promise<ItWorkOrderLog>;
  dashboard(): Promise<ItDashboard>;
}

export function useItApi(): ItApi {
  const api = useService(apiClientToken);
  return useMemo(
    () => ({
      async me() {
        const result = await api.request<Envelope<ItMe>>({ path: 'it/me' });
        return result.data;
      },
      async listAssets(filter) {
        const result = await api.request<Envelope<ItAsset[]>>({
          path: 'it/assets',
          query: {
            category: filter?.category || undefined,
            status: filter?.status || undefined,
            search: filter?.search || undefined,
          },
        });
        return result.data;
      },
      async createAsset(input) {
        const result = await api.request<Envelope<ItAsset>>({
          path: 'it/assets',
          method: 'POST',
          json: input,
        });
        return result.data;
      },
      async updateAsset(id, input) {
        const result = await api.request<Envelope<ItAsset>>({
          path: `it/assets/${id}`,
          method: 'PATCH',
          json: input,
        });
        return result.data;
      },
      async deleteAsset(id) {
        await api.request({ path: `it/assets/${id}`, method: 'DELETE' });
      },
      async listAssignments(assetId) {
        const result = await api.request<Envelope<ItAssignment[]>>({
          path: 'it/asset-assignments',
          query: { assetId },
        });
        return result.data;
      },
      async createAssignment(input) {
        const result = await api.request<Envelope<ItAssignment>>({
          path: 'it/asset-assignments',
          method: 'POST',
          json: input,
        });
        return result.data;
      },
      async returnAssignment(id, returnedAt) {
        const result = await api.request<Envelope<ItAssignment>>({
          path: `it/asset-assignments/${id}/return`,
          method: 'POST',
          json: { returnedAt: returnedAt ?? null },
        });
        return result.data;
      },
      async listWorkOrders() {
        const result = await api.request<Envelope<ItWorkOrder[]>>({
          path: 'it/work-orders',
        });
        return result.data;
      },
      async createWorkOrder(input) {
        const result = await api.request<Envelope<ItWorkOrder>>({
          path: 'it/work-orders',
          method: 'POST',
          json: input,
        });
        return result.data;
      },
      async getWorkOrder(id) {
        const result = await api.request<Envelope<ItWorkOrder>>({
          path: `it/work-orders/${id}`,
        });
        return result.data;
      },
      async transitionWorkOrder(id, status) {
        const result = await api.request<Envelope<ItWorkOrder>>({
          path: `it/work-orders/${id}/transition`,
          method: 'POST',
          json: { status },
        });
        return result.data;
      },
      async addWorkOrderLog(id, content) {
        const result = await api.request<Envelope<ItWorkOrderLog>>({
          path: `it/work-orders/${id}/logs`,
          method: 'POST',
          json: { content },
        });
        return result.data;
      },
      async dashboard() {
        const result = await api.request<Envelope<ItDashboard>>({
          path: 'it/dashboard',
        });
        return result.data;
      },
    }),
    [api],
  );
}
