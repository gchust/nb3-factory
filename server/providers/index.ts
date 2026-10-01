import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { ProjectDocumentServiceProvider } from './project-documents.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ProjectDocumentServiceProvider,
];

export default serviceProviders;
