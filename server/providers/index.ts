import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import FieldVisitProvider, {
  fieldVisitServiceToken,
  type FieldVisitService,
} from './field-visits.js';

export { fieldVisitServiceToken, FieldVisitProvider };
export type { FieldVisitService };

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  FieldVisitProvider,
];

export default serviceProviders;
