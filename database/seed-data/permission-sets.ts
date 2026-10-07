import { definePermissionSet } from '@nocobase/authorization/permission-sets';

import { CRM_PAGE_IDS, crmReference } from '../../server/crm/resources.ts';

/**
 * The initial CRM permission sets. They are ordinary persisted configuration:
 * a seed writes them once on installation, and an administrator can change
 * their grants or assignments in the authorization workspace afterwards.
 *
 * A sales representative only ever reaches the records they own; a supervisor
 * reaches the whole team's and is the only one who may decide the assistant's
 * suggestions.
 */

const SALES_PAGES = [
  CRM_PAGE_IDS.dashboard,
  CRM_PAGE_IDS.customers,
  CRM_PAGE_IDS.opportunities,
  CRM_PAGE_IDS.followUps,
].map((id) => ({
  resource: { type: 'page', id },
  actions: [{ action: 'access' }],
}));

/** Own records only: every data scope resolves against the row's `ownerId`. */
export const crmSales = definePermissionSet('crm-sales')
  .title('CRM sales representative')
  .grant(...SALES_PAGES)
  .grant(
    crmReference.grant({
      view: {
        customers: 'recordsIOwn',
        contacts: 'recordsIOwn',
        opportunities: 'recordsIOwn',
        followUps: 'recordsIOwn',
      },
      edit: {
        customers: 'recordsIOwn',
        contacts: 'recordsIOwn',
        opportunities: 'recordsIOwn',
        followUps: 'recordsIOwn',
      },
      delete: {
        customers: 'recordsIOwn',
        contacts: 'recordsIOwn',
        opportunities: 'recordsIOwn',
        followUps: 'recordsIOwn',
      },
    }),
  )
  .build();

/** The whole team, plus the assistant's suggestions and reassignment. */
export const crmSalesManager = definePermissionSet('crm-sales-manager')
  .title('CRM sales supervisor')
  .grant(...SALES_PAGES)
  .grant(
    crmReference.grant({
      view: {
        customers: 'allRecords',
        contacts: 'allRecords',
        opportunities: 'allRecords',
        followUps: 'allRecords',
      },
      edit: {
        customers: 'allRecords',
        contacts: 'allRecords',
        opportunities: 'allRecords',
        followUps: 'allRecords',
      },
      delete: {
        customers: 'allRecords',
        contacts: 'allRecords',
        opportunities: 'allRecords',
        followUps: 'allRecords',
      },
      suggest: {
        suggestions: 'allRecords',
        customers: 'allRecords',
        opportunities: 'allRecords',
        followUps: 'allRecords',
      },
      manageTeam: {},
    }),
  )
  .build();
