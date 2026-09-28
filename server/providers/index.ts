import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { DevicesProvider } from './devices.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  DevicesProvider,
];

export default serviceProviders;
