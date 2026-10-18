import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { TodosProvider } from './todos/index.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  TodosProvider,
];

export default serviceProviders;
