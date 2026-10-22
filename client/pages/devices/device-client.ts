import type { ApiClient } from '@nocobase/app-client';

/** The statuses the server stores. The wording for each lives in the locale files, keyed by these values. */
export const DEVICE_STATUSES = ['available', 'borrowed'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export interface Device {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly notes: string | null;
}

export interface DeviceList {
  readonly data: readonly Device[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

export interface DeviceInput {
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly notes: string | null;
}

/** The device ledger's endpoint, so the page and its dialog share one place that knows the request shapes. */
export class DeviceClient {
  constructor(private readonly api: ApiClient) {}

  async list(query: {
    readonly status?: DeviceStatus;
    readonly pageSize?: number;
  }): Promise<DeviceList> {
    return this.api.request<DeviceList>({
      path: 'devices',
      query: { status: query.status, pageSize: query.pageSize },
    });
  }

  async create(input: DeviceInput): Promise<Device> {
    const { data } = await this.api.request<{ data: Device }>({
      path: 'devices',
      method: 'POST',
      json: input,
    });
    return data;
  }

  async update(id: string, input: Partial<DeviceInput>): Promise<Device> {
    const { data } = await this.api.request<{ data: Device }>({
      path: `devices/${encodeURIComponent(id)}`,
      method: 'PATCH',
      json: input,
    });
    return data;
  }
}
