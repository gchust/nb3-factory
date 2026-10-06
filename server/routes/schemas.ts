import { z } from 'zod';

import {
  CUSTOMER_DETAIL_CHILD_LIMIT,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  OPPORTUNITY_STAGES,
  type ContactView,
  type CustomerDetailView,
  type CustomerView,
  type OpportunityView,
} from '../providers/crm.js';

/**
 * Request schemas and response schemas for the customer, contact and
 * opportunity endpoints.
 *
 * The response schemas are annotated with the service's view types, so a
 * documented response cannot drift from the one the handler returns without
 * failing `typecheck`. Nothing validates a response against them: they describe
 * what the routes send in the API document at `/api/swagger/docs`.
 */

export const CustomerParams = z.object({
  customerId: z.string().min(1).meta({ description: 'The customer id.' }),
});

export const ContactParams = z.object({
  contactId: z.string().min(1).meta({ description: 'The contact id.' }),
});

export const OpportunityParams = z.object({
  opportunityId: z.string().min(1).meta({ description: 'The opportunity id.' }),
});

/** The paging every list endpoint accepts, shared so the three lists page alike. */
const pagingFields = {
  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(1)
    .meta({ description: 'The 1-based page to return.' }),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .meta({
      description: `How many records one page holds, at most ${MAX_PAGE_SIZE}.`,
    }),
};

const searchField = z
  .string()
  .optional()
  .meta({ description: 'A case-insensitive text search; blank is ignored.' });

export const ListCustomersQuery = z.object({
  q: searchField.meta({
    description:
      'A case-insensitive search over the customer name; blank is ignored.',
  }),
  ...pagingFields,
});

export const ListContactsQuery = z.object({
  q: searchField.meta({
    description:
      'A case-insensitive search over the contact name and contact method; blank is ignored.',
  }),
  customerId: z
    .string()
    .min(1)
    .optional()
    .meta({ description: 'Narrow the list to one customer.' }),
  ...pagingFields,
});

export const ListOpportunitiesQuery = z.object({
  q: searchField.meta({
    description:
      'A case-insensitive search over the opportunity name; blank is ignored.',
  }),
  customerId: z
    .string()
    .min(1)
    .optional()
    .meta({ description: 'Narrow the list to one customer.' }),
  stage: z
    .enum(OPPORTUNITY_STAGES)
    .optional()
    .meta({ description: 'Narrow the list to one stage.' }),
  ...pagingFields,
});

export const CreateCustomerInput = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .meta({ description: 'The customer name.' }),
  industry: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .meta({ description: 'The industry the customer works in.' }),
});

export const UpdateCustomerInput = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .meta({ description: 'The customer name.' }),
  industry: z.string().trim().max(120).nullish().meta({
    description: 'The industry the customer works in; `null` clears it.',
  }),
});

export const CreateContactInput = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .meta({ description: 'The contact name.' }),
  contact: z.string().trim().max(200).nullish().meta({
    description:
      'How to reach the contact: a phone number, an email address or a handle.',
  }),
  customerId: z
    .string()
    .min(1)
    .meta({ description: 'The customer the contact belongs to.' }),
});

export const UpdateContactInput = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .meta({ description: 'The contact name.' }),
  contact: z.string().trim().max(200).nullish().meta({
    description:
      'How to reach the contact: a phone number, an email address or a handle; `null` clears it.',
  }),
  customerId: z
    .string()
    .min(1)
    .optional()
    .meta({ description: 'The customer the contact belongs to.' }),
});

export const CreateOpportunityInput = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .meta({ description: 'The opportunity name.' }),
  customerId: z
    .string()
    .min(1)
    .meta({ description: 'The customer the opportunity belongs to.' }),
  amount: z
    .number()
    .finite()
    .nonnegative()
    .default(0)
    .meta({ description: 'The expected amount, in the application currency.' }),
  stage: z
    .enum(OPPORTUNITY_STAGES)
    .default(OPPORTUNITY_STAGES[0])
    .meta({ description: 'The stage the opportunity is in.' }),
});

export const UpdateOpportunityInput = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .optional()
    .meta({ description: 'The opportunity name.' }),
  customerId: z
    .string()
    .min(1)
    .optional()
    .meta({ description: 'The customer the opportunity belongs to.' }),
  amount: z
    .number()
    .finite()
    .nonnegative()
    .optional()
    .meta({ description: 'The expected amount, in the application currency.' }),
  stage: z
    .enum(OPPORTUNITY_STAGES)
    .optional()
    .meta({ description: 'The stage the opportunity is in.' }),
});

const idField = z.string().meta({ description: 'The record id.' });

const timestampFields = {
  createdAt: z
    .string()
    .meta({ description: 'When the record was created, as a UTC instant.' }),
  updatedAt: z.string().meta({
    description: 'When the record was last changed, as a UTC instant.',
  }),
};

export const CustomerSchema: z.ZodType<CustomerView> = z
  .object({
    id: idField,
    name: z.string().meta({ description: 'The customer name.' }),
    industry: z.string().nullable().meta({
      description: 'The industry the customer works in, when one is recorded.',
    }),
    ...timestampFields,
  })
  .meta({ ref: 'CrmCustomer' });

export const ContactSchema: z.ZodType<ContactView> = z
  .object({
    id: idField,
    name: z.string().meta({ description: 'The contact name.' }),
    contact: z
      .string()
      .nullable()
      .meta({ description: 'How to reach the contact, when one is recorded.' }),
    customerId: z
      .string()
      .meta({ description: 'The customer the contact belongs to.' }),
    customerName: z.string().nullable().meta({
      description:
        'That customer’s name, so a list renders without a second request.',
    }),
    ...timestampFields,
  })
  .meta({ ref: 'CrmContact' });

export const OpportunitySchema: z.ZodType<OpportunityView> = z
  .object({
    id: idField,
    name: z.string().meta({ description: 'The opportunity name.' }),
    customerId: z
      .string()
      .meta({ description: 'The customer the opportunity belongs to.' }),
    customerName: z.string().nullable().meta({
      description:
        'That customer’s name, so a list renders without a second request.',
    }),
    amount: z.number().meta({ description: 'The expected amount.' }),
    stage: z
      .enum(OPPORTUNITY_STAGES)
      .meta({ description: 'The stage the opportunity is in.' }),
    ...timestampFields,
  })
  .meta({ ref: 'CrmOpportunity' });

export const CustomerDetailSchema: z.ZodType<CustomerDetailView> = z
  .object({
    id: idField,
    name: z.string().meta({ description: 'The customer name.' }),
    industry: z.string().nullable().meta({
      description: 'The industry the customer works in, when one is recorded.',
    }),
    contacts: z.array(ContactSchema).meta({
      description: `The customer's contacts, newest first, at most ${CUSTOMER_DETAIL_CHILD_LIMIT}.`,
    }),
    opportunities: z.array(OpportunitySchema).meta({
      description: `The customer's opportunities, newest first, at most ${CUSTOMER_DETAIL_CHILD_LIMIT}.`,
    }),
    opportunityAmountTotal: z.number().meta({
      description:
        'The sum of every opportunity this customer owns, including any beyond the returned page.',
    }),
    ...timestampFields,
  })
  .meta({
    ref: 'CrmCustomerDetail',
    description:
      'A customer with the contacts and opportunities that belong to it.',
  });
