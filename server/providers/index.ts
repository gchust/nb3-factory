import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { ProjectMaterialServiceProvider } from './project-material.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ProjectMaterialServiceProvider,
];

export default serviceProviders;
