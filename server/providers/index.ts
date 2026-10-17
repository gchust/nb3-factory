import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import { ItsmProvider } from './itsm.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ItsmProvider,
];

export default serviceProviders;
