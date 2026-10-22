import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import DevicesProvider from './devices.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  DevicesProvider,
];

export {
  DEVICE_STATUSES,
  DeviceError,
  devicesServiceToken,
  type Device,
  type DeviceStatus,
  type DevicesService,
} from './devices.js';

export default serviceProviders;
