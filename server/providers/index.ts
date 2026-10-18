import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { DeviceServiceProvider } from './devices.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  DeviceServiceProvider,
];

export default serviceProviders;
