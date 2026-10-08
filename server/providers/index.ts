import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import { MaterialsAIProvider } from './ai-resources.js';
import { MaterialsProvider } from './materials.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  MaterialsProvider,
  MaterialsAIProvider,
];

export default serviceProviders;
