import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { ItRepairProvider } from '../it-repair/provider.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ItRepairProvider,
];

export default serviceProviders;
