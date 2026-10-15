import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import DocumentServiceProvider from './documents.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  DocumentServiceProvider,
];

export default serviceProviders;
