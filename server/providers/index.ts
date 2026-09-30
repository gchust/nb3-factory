import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { AIResourcesProvider } from './ai-resources.js';
import { MaterialsProvider } from './materials.js';

// Registration order is boot order. `AIResourcesProvider` resolves the AI
// manager the AI Employee plugin's own provider boots, and the plugin's
// providers are registered before the application's, so it runs after.
const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  MaterialsProvider,
  AIResourcesProvider,
];

export default serviceProviders;
