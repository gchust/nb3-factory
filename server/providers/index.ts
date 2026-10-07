import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import { SalesProvider } from './sales.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  SalesProvider,
];

export default serviceProviders;
