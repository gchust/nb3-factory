/** The fixed statuses a device may be in. Values are stored as-is and never translated. */
export const DEVICE_STATUSES = ['available', 'borrowed'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** A device as the API returns it. `code` and `name` are user-entered and never translated. */
export interface Device {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
}

/** The `{ data, meta }` shape of the list endpoint. */
export interface DeviceList {
  readonly data: Device[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

/**
 * What the list passes to its child routes through `<Outlet context>`: reload the
 * list, plus the callbacks the edit dialog needs when it saves or finds the
 * record gone.
 */
export interface DevicesOutletContext {
  readonly reload: () => void;
  readonly onSaved: (device: Device) => void;
  readonly onNotFound: () => void;
}

/** Narrow an arbitrary string to a known device status. */
export function isDeviceStatus(value: string | null): value is DeviceStatus {
  return DEVICE_STATUSES.some((status) => status === value);
}
