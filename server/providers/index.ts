import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import TeamTasksProvider from './team-tasks.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  TeamTasksProvider,
];

export default serviceProviders;
