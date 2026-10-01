import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { TodoServiceProvider } from './todos.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  TodoServiceProvider,
];

export default serviceProviders;
