import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import DevicesProvider from './devices.js';

export { deviceServiceToken } from './devices.js';
export type {
  CreateDeviceInput,
  DeviceErrorCode,
  DevicePage,
  DeviceService,
  DeviceStatus,
  DeviceView,
  ListDevicesInput,
  UpdateDeviceInput,
} from './devices.js';
export { DEVICE_STATUSES, DeviceError } from './devices.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  DevicesProvider,
];

export default serviceProviders;
