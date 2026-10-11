/** The device ledger's statuses, stored as canonical English values and translated by the interface. */
export const DEVICE_STATUSES = ['available', 'borrowed'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** One device as the API returns it. */
export interface Device {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
}

/** The `{ data, meta }` shape of `GET /api/devices`. */
export interface DeviceList {
  readonly data: readonly Device[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

/**
 * What the list page passes to the create and edit child routes rendered in its `<Outlet>`: refreshing the list
 * behind the dialog is the only thing either of them needs.
 */
export interface DevicesOutletContext {
  readonly reload: () => void;
}

export function isDeviceStatus(value: string | null): value is DeviceStatus {
  return DEVICE_STATUSES.some((status) => status === value);
}
