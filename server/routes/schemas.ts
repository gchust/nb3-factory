import { z } from 'zod';
import type {
  ContactView,
  CustomerDetailView,
  CustomerView,
  OpportunityView,
} from '../providers/sales.js';
import { OPPORTUNITY_STAGES } from '../providers/sales.js';

/**
 * The response schemas, each typed against the view the service returns (`z.ZodType<View>`). The document therefore
 * describes what the endpoints actually answer: a field that stops matching the service is a compile error rather
 * than a stale document.
 *
 * `id` values travel as strings. `customerId` is a string for the same reason, so a client never has to guess whether
 * an identifier is a number.
 */
export const CustomerSchema: z.ZodType<CustomerView> = z
  .object({
    id: z.string().describe('Customer identifier.'),
    name: z.string().describe('Customer name.'),
    industry: z
      .string()
      .nullable()
      .describe('Industry the customer operates in.'),
  })
  .meta({ ref: 'Customer' });

export const ContactSchema: z.ZodType<ContactView> = z
  .object({
    id: z.string().describe('Contact identifier.'),
    name: z.string().describe('Contact name.'),
    contactInfo: z
      .string()
      .nullable()
      .describe(
        'How to reach the contact: an email address, a phone number, or a note.',
      ),
    customerId: z
      .string()
      .describe('Identifier of the customer the contact belongs to.'),
    customerName: z
      .string()
      .describe('Name of the customer the contact belongs to.'),
  })
  .meta({ ref: 'Contact' });

export const OpportunitySchema: z.ZodType<OpportunityView> = z
  .object({
    id: z.string().describe('Opportunity identifier.'),
    name: z.string().nullable().describe('Opportunity name.'),
    customerId: z
      .string()
      .describe('Identifier of the customer the opportunity belongs to.'),
    customerName: z
      .string()
      .describe('Name of the customer the opportunity belongs to.'),
    amount: z
      .number()
      .nullable()
      .describe('Expected amount. Negative amounts are not accepted.'),
    stage: z
      .enum(OPPORTUNITY_STAGES)
      .describe('Stage the opportunity is in: `following`, `won` or `lost`.'),
  })
  .meta({ ref: 'Opportunity' });

export const CustomerDetailSchema: z.ZodType<CustomerDetailView> = z
  .object({
    id: z.string().describe('Customer identifier.'),
    name: z.string().describe('Customer name.'),
    industry: z
      .string()
      .nullable()
      .describe('Industry the customer operates in.'),
    contacts: z.array(ContactSchema).describe("The customer's contacts."),
    opportunities: z
      .array(OpportunitySchema)
      .describe("The customer's opportunities."),
    opportunityTotal: z
      .number()
      .describe('Sum of the amounts of every opportunity of this customer.'),
  })
  .meta({ ref: 'CustomerDetail' });

/** `page` starts at 1. The list metadata answers the page and page size alongside the total. */
export const ListMetaSchema = z
  .object({
    total: z
      .number()
      .int()
      .min(0)
      .describe('Number of records matching the query.'),
    page: z
      .number()
      .int()
      .min(1)
      .describe('Page the response contains, starting at 1.'),
    pageSize: z.number().int().min(1).describe('Records requested per page.'),
  })
  .meta({ ref: 'SalesListMeta' });

const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);
const search = z.string().trim().max(200).optional();

/** A path segment carrying a record id. */
export const IdParam = z
  .strictObject({ id: z.string().min(1).max(64) })
  .describe('Identifier of the record the request addresses.');

export const ListCustomersQuery = z
  .strictObject({ q: search, page, pageSize })
  .describe('Search and pagination for the customer list.');

export const ListContactsQuery = z
  .strictObject({
    q: search,
    customerId: z.string().min(1).max(64).optional(),
    page,
    pageSize,
  })
  .describe('Search, customer scope and pagination for the contact list.');

export const ListOpportunitiesQuery = z
  .strictObject({
    q: search,
    customerId: z.string().min(1).max(64).optional(),
    stage: z.enum(OPPORTUNITY_STAGES).optional(),
    page,
    pageSize,
  })
  .describe(
    'Search, customer scope, stage filter and pagination for the opportunity list.',
  );

/** An amount is a non-negative number with at most two decimal places. */
const amount = z.number().min(0).max(999_999_999_999.99);

const customerName = z.string().trim().min(1).max(128);
const customerIndustry = z.string().trim().max(128).nullable();
const contactName = z.string().trim().min(1).max(128);
const contactInfo = z.string().trim().max(256).nullable();
const opportunityName = z.string().trim().max(128).nullable();

export const CreateCustomerInput = z
  .strictObject({
    name: customerName,
    industry: customerIndustry.optional().default(null),
  })
  .describe('A customer to create.');

export const UpdateCustomerInput = z
  .strictObject({
    name: customerName.optional(),
    industry: customerIndustry.optional(),
  })
  .describe('The customer fields to change. Omitted fields keep their value.');

export const CreateContactInput = z
  .strictObject({
    name: contactName,
    contactInfo: contactInfo.optional().default(null),
    customerId: z.string().min(1).max(64),
  })
  .describe('A contact to create.');

export const UpdateContactInput = z
  .strictObject({
    name: contactName.optional(),
    contactInfo: contactInfo.optional(),
    customerId: z.string().min(1).max(64).optional(),
  })
  .describe('The contact fields to change. Omitted fields keep their value.');

export const CreateOpportunityInput = z
  .strictObject({
    name: opportunityName.optional().default(null),
    customerId: z.string().min(1).max(64),
    amount: amount.nullable().optional().default(null),
    stage: z.enum(OPPORTUNITY_STAGES).optional().default('following'),
  })
  .describe('An opportunity to create.');

export const UpdateOpportunityInput = z
  .strictObject({
    name: opportunityName.optional(),
    customerId: z.string().min(1).max(64).optional(),
    amount: amount.nullable().optional(),
    stage: z.enum(OPPORTUNITY_STAGES).optional(),
  })
  .describe(
    'The opportunity fields to change. Omitted fields keep their value.',
  );
