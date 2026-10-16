import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import devices from './devices.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ...devices,
];

export default serviceProviders;
