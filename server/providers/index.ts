import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import MaterialsProvider from './materials.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  MaterialsProvider,
];

export default serviceProviders;
