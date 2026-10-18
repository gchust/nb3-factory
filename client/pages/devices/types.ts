/** The statuses a device can be in; the values are what the endpoint stores and returns. */
export const DEVICE_STATUSES = ['available', 'borrowed'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** A device in the ledger: an identifying code, a name and its current status. */
export interface Device {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
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

/**
 * What the create and edit dialogs read through `<Outlet context>` from the list they open over: the list's own
 * refresh, and the two outcomes an edit save can have that the list has to react to.
 */
export interface DevicesOutletContext {
  /** Refreshes the list's data in the background. */
  readonly reload: () => void;
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSaved: (device: Device) => void;
  /** Called on finding that the record no longer exists, so the list refetches and the row disappears. */
  readonly onNotFound: () => void;
}
