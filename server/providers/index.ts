import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import CrmProvider from './crm.js';

export {
  crmServiceToken,
  CrmError,
  type ContactInput,
  type ContactRecord,
  type CrmErrorCode,
  type CrmService,
  type CustomerDetail,
  type CustomerInput,
  type CustomerRecord,
  type OpportunityInput,
  type OpportunityRecord,
  type OpportunityStage,
} from './crm.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  CrmProvider,
];

export default serviceProviders;
