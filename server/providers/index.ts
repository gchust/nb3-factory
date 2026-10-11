import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import DeviceProvider from './devices.js';

export {
  createDeviceService,
  DeviceCodeTakenError,
  DeviceNotFoundError,
  deviceServiceToken,
  DEVICE_STATUSES,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
} from './devices.js';
export type {
  CreateDeviceInput,
  DeviceList,
  DeviceListQuery,
  DeviceService,
  DeviceStatus,
  DeviceView,
  UpdateDeviceInput,
} from './devices.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  DeviceProvider,
];

export default serviceProviders;
