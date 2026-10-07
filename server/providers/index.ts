import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { ProjectMaterialsProvider } from './project-materials.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ProjectMaterialsProvider,
];

export default serviceProviders;
