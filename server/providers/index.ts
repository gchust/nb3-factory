import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import LabServiceProvider from './lab-service.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  LabServiceProvider,
];

export { labServiceToken, LabError } from './lab-service.js';
export type { LabService } from './lab-service.js';

export default serviceProviders;
