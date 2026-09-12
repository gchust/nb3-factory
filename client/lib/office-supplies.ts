import { type ApiClient } from '@nocobase/app-client';

export interface OfficeSupply {
  id: number;
  code: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  remark: string | null;
  createdAt: string;
}

export interface SupplyRequisition {
  id: number;
  supplyId: number;
  requisitionedAt: string;
  requisitioner: string;
  quantity: number;
  remark: string | null;
  createdAt: string;
}

export interface SupplyDetail {
  supply: OfficeSupply;
  requisitions: readonly SupplyRequisition[];
}

export interface OfficeSupplyInput {
  code: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  remark?: string | null;
}

export interface SupplyRequisitionInput {
  requisitionedAt: string;
  requisitioner: string;
  quantity: number;
  remark?: string | null;
}

export interface RequisitionResult {
  supply: OfficeSupply;
  requisition: SupplyRequisition;
}

export interface ApiErrorPayload {
  readonly code?: string;
  readonly message?: string;
}

/**
 * Extracts the application error code from an api-client failure. The request
 * helper throws an error carrying the parsed JSON body under `payload`, so the
 * pages can translate `code` into a localized message.
 */
export function errorCode(error: unknown): string {
  const payload = (error as { payload?: unknown } | null)?.payload;
  if (isRecord(payload) && typeof payload.code === 'string') {
    return payload.code;
  }
  return 'UNKNOWN';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Client for the application-owned /api/office-supplies endpoints. */
export class OfficeSuppliesClient {
  public constructor(private readonly api: ApiClient) {}

  public list(): Promise<readonly OfficeSupply[]> {
    return this.getJson<readonly OfficeSupply[]>('office-supplies');
  }

  public get(supplyId: number): Promise<SupplyDetail> {
    return this.getJson<SupplyDetail>(
      `office-supplies/${encodeURIComponent(supplyId)}`,
    );
  }

  public create(input: OfficeSupplyInput): Promise<OfficeSupply> {
    return this.sendJson<OfficeSupply>('office-supplies', 'POST', input);
  }

  public update(
    supplyId: number,
    input: Partial<OfficeSupplyInput>,
  ): Promise<OfficeSupply> {
    return this.sendJson<OfficeSupply>(
      `office-supplies/${encodeURIComponent(supplyId)}`,
      'PUT',
      input,
    );
  }

  public async remove(supplyId: number): Promise<void> {
    await this.sendJson<{ deleted: true }>(
      `office-supplies/${encodeURIComponent(supplyId)}`,
      'DELETE',
    );
  }

  public requisition(
    supplyId: number,
    input: SupplyRequisitionInput,
  ): Promise<RequisitionResult> {
    return this.sendJson<RequisitionResult>(
      `office-supplies/${encodeURIComponent(supplyId)}/requisitions`,
      'POST',
      input,
    );
  }

  private getJson<T>(path: string): Promise<T> {
    return this.api.request<{ data: T }>({ path }).then(({ data }) => data);
  }

  private sendJson<T>(
    path: string,
    method: 'POST' | 'PUT' | 'DELETE',
    json?: unknown,
  ): Promise<T> {
    return this.api
      .request<{ data: T }>({
        path,
        method,
        ...(json === undefined ? {} : { json }),
      })
      .then(({ data }) => data);
  }
}
