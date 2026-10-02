import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import { LibraryProvider } from './library.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  LibraryProvider,
];

export default serviceProviders;
