import { defineCompositeResource } from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';

/**
 * The CRM business operations, declared once here and registered by the CRM
 * provider. Registration makes them grantable; the seeded permission sets in
 * `database/seed-data/permission-sets.ts` decide who holds them.
 *
 * Every action's data scope carries a record-access choice, so a permission
 * set can hand a sales representative only their own records and a supervisor
 * the whole team's. `ownerId` is the field `recordsIOwn` resolves against, and
 * every CRM table has one.
 */

interface CustomerRow {
  id: number;
  name: string;
  ownerId: string;
  industry: string | null;
  level: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  source: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ContactRow {
  id: number;
  customerId: number;
  ownerId: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OpportunityRow {
  id: number;
  customerId: number;
  ownerId: string;
  name: string;
  stage: string;
  amount: number;
  expectedCloseDate: string | null;
  lostReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FollowUpRow {
  id: number;
  customerId: number;
  opportunityId: number | null;
  ownerId: string;
  method: string;
  content: string | null;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SuggestionRow {
  id: number;
  customerId: number;
  opportunityId: number | null;
  followUpId: number | null;
  kind: string;
  title: string;
  detail: string | null;
  status: string;
  decidedById: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Reads, restricted to rows the grant's record access selects. */
const customerRead = defineDatabasePermission((p) =>
  p
    .collection<CustomerRow>('crmCustomers')
    .title('Customers')
    .options(recordAccess.allRecords, recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn)
    .read('*'),
);
const contactRead = defineDatabasePermission((p) =>
  p
    .collection<ContactRow>('crmContacts')
    .title('Contacts')
    .options(recordAccess.allRecords, recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn)
    .read('*'),
);
const opportunityRead = defineDatabasePermission((p) =>
  p
    .collection<OpportunityRow>('crmOpportunities')
    .title('Opportunities')
    .options(recordAccess.allRecords, recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn)
    .read('*'),
);
const followUpRead = defineDatabasePermission((p) =>
  p
    .collection<FollowUpRow>('crmFollowUps')
    .title('Follow-up records')
    .options(recordAccess.allRecords, recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn)
    .read('*'),
);

/** Creates and updates, restricted to rows the grant's record access selects. */
const customerWrite = defineDatabasePermission((p) =>
  p
    .collection<CustomerRow>('crmCustomers')
    .title('Customers')
    .options(recordAccess.allRecords, recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn)
    .read('*')
    .create('*')
    .update('*'),
);
const contactWrite = defineDatabasePermission((p) =>
  p
    .collection<ContactRow>('crmContacts')
    .title('Contacts')
    .options(recordAccess.allRecords, recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn)
    .read('*')
    .create('*')
    .update('*'),
);
const opportunityWrite = defineDatabasePermission((p) =>
  p
    .collection<OpportunityRow>('crmOpportunities')
    .title('Opportunities')
    .options(recordAccess.allRecords, recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn)
    .read('*')
    .create('*')
    .update('*'),
);
const followUpWrite = defineDatabasePermission((p) =>
  p
    .collection<FollowUpRow>('crmFollowUps')
    .title('Follow-up records')
    .options(recordAccess.allRecords, recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn)
    .read('*')
    .create('*')
    .update('*'),
);

/** Deletes, restricted to rows the grant's record access selects. */
const customerDelete = defineDatabasePermission((p) =>
  p
    .collection<CustomerRow>('crmCustomers')
    .title('Customers')
    .options(recordAccess.allRecords, recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn)
    .delete(),
);
const contactDelete = defineDatabasePermission((p) =>
  p
    .collection<ContactRow>('crmContacts')
    .title('Contacts')
    .options(recordAccess.allRecords, recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn)
    .delete(),
);
const opportunityDelete = defineDatabasePermission((p) =>
  p
    .collection<OpportunityRow>('crmOpportunities')
    .title('Opportunities')
    .options(recordAccess.allRecords, recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn)
    .delete(),
);
const followUpDelete = defineDatabasePermission((p) =>
  p
    .collection<FollowUpRow>('crmFollowUps')
    .title('Follow-up records')
    .options(recordAccess.allRecords, recordAccess.recordsIOwn)
    .default(recordAccess.recordsIOwn)
    .delete(),
);

/**
 * The assistant's suggestions. Only a supervisor may read or decide them, and
 * generation reads the team's records, so the whole action is granted to the
 * supervisor permission set alone.
 */
const suggestionManage = defineDatabasePermission((p) =>
  p
    .collection<SuggestionRow>('crmSuggestions')
    .title('Assistant suggestions')
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords)
    .read('*')
    .create('*')
    .update(['status', 'decidedById', 'decidedAt']),
);

/**
 * Team-wide customer management: reassigning a customer to another
 * representative, and the marker that a holder is a supervisor.
 */
const customerTeamManage = defineDatabasePermission((p) =>
  p
    .collection<CustomerRow>('crmCustomers')
    .title('Customers (whole team)')
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords)
    .read('*')
    .update(['ownerId']),
);

export const crm = defineCompositeResource('crm', (resource) =>
  resource
    .title('CRM')
    .action('view', (action) =>
      action
        .title('CRM: view records')
        .grant('customers', customerRead)
        .grant('contacts', contactRead)
        .grant('opportunities', opportunityRead)
        .grant('followUps', followUpRead),
    )
    .action('edit', (action) =>
      action
        .title('CRM: create and edit records')
        .grant('customers', customerWrite)
        .grant('contacts', contactWrite)
        .grant('opportunities', opportunityWrite)
        .grant('followUps', followUpWrite),
    )
    .action('delete', (action) =>
      action
        .title('CRM: delete records')
        .grant('customers', customerDelete)
        .grant('contacts', contactDelete)
        .grant('opportunities', opportunityDelete)
        .grant('followUps', followUpDelete),
    )
    .action('suggest', (action) =>
      action
        .title('CRM: generate and decide assistant suggestions')
        .grant('suggestions', suggestionManage)
        .grant('customers', customerRead)
        .grant('opportunities', opportunityRead)
        .grant('followUps', followUpRead),
    )
    // A capability action: holding it means "sees and manages the whole team",
    // which lets a supervisor reassign a customer to another representative.
    .action('manageTeam', (action) =>
      action
        .title('CRM: manage the whole team')
        .grant('customers', customerTeamManage),
    ),
);

/** The reference the provider registers and the seeds and routes address. */
export const crmReference = crm.reference();

/** The names the routes and the client both use for this feature's pages. */
export const CRM_PAGE_IDS = {
  dashboard: 'crm.dashboard',
  customers: 'crm.customers',
  opportunities: 'crm.opportunities',
  followUps: 'crm.follow-ups',
} as const;
