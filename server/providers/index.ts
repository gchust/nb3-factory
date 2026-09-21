import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ComplianceProvider from './compliance.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ComplianceProvider,
];

export { complianceServiceToken } from './compliance.js';
export type { ComplianceService } from './compliance.js';

export default serviceProviders;
