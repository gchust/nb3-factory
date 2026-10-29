export const DEVICE_STATUSES = ['available', 'borrowed'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export interface Device {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
}

export interface DeviceListResponse {
  readonly data: readonly Device[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

export interface DeviceResponse {
  readonly data: Device;
}

export interface DeviceOutletContext {
  readonly reload: () => void;
}

export function isDeviceStatus(value: string): value is DeviceStatus {
  return DEVICE_STATUSES.some((status) => status === value);
}
