import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ProjectMaterialServiceProvider from './project-material-service.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ProjectMaterialServiceProvider,
];

export default serviceProviders;
