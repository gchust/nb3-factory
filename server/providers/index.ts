import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { DeviceAuthorizationProvider } from './devices.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  DeviceAuthorizationProvider,
];

export default serviceProviders;
