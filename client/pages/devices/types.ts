export const DEVICE_STATUSES = ['available', 'borrowed'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** What the API returns for one device. `code`, `name` and `notes` are user data, never translated. */
export interface Device {
  id: string;
  code: string;
  name: string;
  status: DeviceStatus;
  notes: string | null;
}

export interface DeviceListResponse {
  data: Device[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface DeviceResponse {
  data: Device;
}

/** The list page passes this to its child dialogs so a saved device refreshes the visible page. */
export interface DevicesOutletContext {
  reload: () => void;
}

export function isDeviceStatus(value: string | null): value is DeviceStatus {
  return value === 'available' || value === 'borrowed';
}
