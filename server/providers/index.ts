import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { ProjectMaterialsServiceProvider } from './materials/index.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ProjectMaterialsServiceProvider,
];

export default serviceProviders;
