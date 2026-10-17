export const DEVICE_STATUSES = ['available', 'borrowed'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export interface Device {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;
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

/** What the create and edit dialogs read through `<Outlet context>` from the list. */
export interface DevicesOutletContext {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
}
