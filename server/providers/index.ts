import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { RepairSampleFilesProvider } from './sample-files-provider.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  RepairSampleFilesProvider,
];

export default serviceProviders;
