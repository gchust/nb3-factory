/** The two borrowing states, mirroring the server's `DEVICE_STATUSES`. */
export const DEVICE_STATUSES = ['available', 'borrowed'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export interface Device {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
}

export interface DeviceList {
  readonly data: Device[];
}

/** The device list passes this to its child routes (the create and edit dialogs) through `<Outlet context>`. */
export interface DevicesOutletContext {
  /** Reload the list from the endpoint; the dialogs call it after a save. */
  readonly reload: () => void;
}

export function isDeviceStatus(value: string | null): value is DeviceStatus {
  return DEVICE_STATUSES.some((status) => status === value);
}
