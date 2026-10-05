import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { MaterialServiceProvider } from './materials.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  MaterialServiceProvider,
];

export default serviceProviders;
