import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { LibraryAuthorizationProvider } from './library.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  LibraryAuthorizationProvider,
];

export default serviceProviders;
