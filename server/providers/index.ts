import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import { HrProvider } from './hr.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  HrProvider,
];

export default serviceProviders;
