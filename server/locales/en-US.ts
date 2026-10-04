import type { LocaleResource } from '@nocobase/i18n';

// The application's own server-side wording. `sales.errors.*` is what the sales routes return alongside a stable
// error `code`; the client maps the code to its own copy, and this text is what an API caller reads.
const enUS = {
  sales: {
    errors: {
      customerNameRequired: 'Customer name is required.',
      customerNotFound: 'The customer does not exist.',
      customerHasRelatedRecords:
        'This customer still has contacts or opportunities. Delete them first.',
      contactNameRequired: 'Contact name is required.',
      contactCustomerRequired: 'A customer is required for this contact.',
      contactNotFound: 'The contact does not exist.',
      opportunityNameRequired: 'Opportunity name is required.',
      opportunityCustomerRequired:
        'A customer is required for this opportunity.',
      opportunityNotFound: 'The opportunity does not exist.',
      invalidAmount: 'Amount must be zero or greater.',
      invalidStage: 'The selected stage does not exist.',
      invalidId: 'The requested record does not exist.',
      invalidBody: 'The request body must be a JSON object.',
    },
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
