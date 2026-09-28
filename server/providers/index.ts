import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import { MaterialsServiceProvider } from './materials.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  MaterialsServiceProvider,
];

export default serviceProviders;
