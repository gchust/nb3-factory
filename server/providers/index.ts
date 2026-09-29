import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import AIResourcesProvider from './ai-resources.js';
import MaterialsProvider from './materials.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  MaterialsProvider,
  AIResourcesProvider,
];

export default serviceProviders;
