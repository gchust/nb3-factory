import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { AIResourcesProvider } from './ai-resources.js';
import { MaterialsProvider } from './materials.js';

export {
  MaterialsService,
  materialsServiceToken,
} from './materials-service.js';
export type {
  ListMaterialsInput,
  MaterialPatch,
  MaterialRecord,
  MaterialsActor,
  MaterialsListResult,
} from './materials-service.js';

// MaterialsProvider registers the service token the assistant tool resolves,
// so it boots before AIResourcesProvider hands that tool to the AI manager.
const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  MaterialsProvider,
  AIResourcesProvider,
];

export default serviceProviders;
