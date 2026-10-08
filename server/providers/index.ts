import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import { MaterialServiceProvider } from './material-service.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  MaterialServiceProvider,
];

export default serviceProviders;
