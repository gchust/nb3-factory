/** The two states a device can be in; the values are the ones the API stores. */
export const DEVICE_STATUSES = ['available', 'borrowed'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export interface Device {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
  /** Free text the person who added the device wrote; it is business data and is never translated. */
  readonly notes: string | null;
}

/** What `GET /api/devices` answers. */
export interface DeviceList {
  readonly data: Device[];
  readonly meta: { readonly total: number };
}

/** What the list passes to its child routes through `<Outlet context>`. */
export interface DevicesOutletContext {
  /** Fetch the list again; safe to call from a dialog after a save. */
  readonly reload: () => void;
}

export function isDeviceStatus(value: string | null): value is DeviceStatus {
  return DEVICE_STATUSES.some((status) => status === value);
}
