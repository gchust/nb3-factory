import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import ContactProvider from './contacts.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ContactProvider,
];

export default serviceProviders;
