export const DEVICE_STATUSES = ['available', 'borrowed'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** A device as `GET /api/devices` returns it: string id, ISO 8601 timestamps, `remark` null when absent. */
export interface Device {
  readonly id: string;
  readonly reference: string;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly remark: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The body of `GET /api/devices`: one page of devices and where it sits among all matching records. */
export interface DeviceList {
  readonly data: Device[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    /** The number of matching records on all pages. */
    readonly total: number;
  };
}

/** What the create and edit dialogs read through `<Outlet context>` from the list behind them. */
export interface DevicesOutletContext {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSaved: (device: Device) => void;
  /** Called on finding that the record no longer exists. */
  readonly onNotFound: () => void;
}
