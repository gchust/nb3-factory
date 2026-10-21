import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import DeviceProvider from './devices.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  DeviceProvider,
];

export default serviceProviders;
