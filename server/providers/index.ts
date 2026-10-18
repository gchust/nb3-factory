import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import LibraryProvider, { libraryServiceToken } from './library.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  LibraryProvider,
];

export { libraryServiceToken };
export default serviceProviders;
