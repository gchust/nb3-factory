import { z } from 'zod';

import {
  CUSTOMER_LEVELS,
  FOLLOW_UP_METHODS,
  FOLLOW_UP_STATUSES,
  OPPORTUNITY_STAGES,
  SUGGESTION_STATUSES,
  type ContactView,
  type CustomerDetailView,
  type CustomerView,
  type DashboardView,
  type FollowUpView,
  type GenerateSuggestionsResult,
  type ImportPreview,
  type ImportRowInput,
  type ImportRowResult,
  type OpportunityView,
  type SuggestionView,
} from '../crm/types.js';

/**
 * The request and response contracts of the CRM routes.
 *
 * Responses are annotated with the service's view types, so a handler that
 * returns a different shape fails `typecheck` instead of drifting away from
 * the generated API document.
 */

const nullableString = z.string().nullable();

// --- Response views -----------------------------------------------------------------

export const StageSummarySchema = z.object({
  stage: z.enum(OPPORTUNITY_STAGES),
  count: z.number().int(),
  amount: z.number(),
});

export const CustomerSchema: z.ZodType<CustomerView> = z
  .object({
    id: z.number().int(),
    name: z.string(),
    ownerId: z.string(),
    industry: nullableString,
    level: z.string(),
    phone: nullableString,
    email: nullableString,
    website: nullableString,
    address: nullableString,
    source: nullableString,
    notes: nullableString,
    createdAt: z.string(),
    updatedAt: z.string(),
    ownerName: nullableString,
  })
  .meta({ ref: 'CrmCustomer' });

export const ContactSchema: z.ZodType<ContactView> = z
  .object({
    id: z.number().int(),
    customerId: z.number().int(),
    ownerId: z.string(),
    name: z.string(),
    position: nullableString,
    phone: nullableString,
    email: nullableString,
    isPrimary: z.boolean(),
    notes: nullableString,
    createdAt: z.string(),
    updatedAt: z.string(),
    ownerName: nullableString,
  })
  .meta({ ref: 'CrmContact' });

export const OpportunitySchema: z.ZodType<OpportunityView> = z
  .object({
    id: z.number().int(),
    customerId: z.number().int(),
    ownerId: z.string(),
    name: z.string(),
    stage: z.string(),
    amount: z.number(),
    expectedCloseDate: nullableString,
    lostReason: nullableString,
    notes: nullableString,
    createdAt: z.string(),
    updatedAt: z.string(),
    ownerName: nullableString,
    customerName: nullableString,
  })
  .meta({ ref: 'CrmOpportunity' });

export const FollowUpSchema: z.ZodType<FollowUpView> = z
  .object({
    id: z.number().int(),
    customerId: z.number().int(),
    opportunityId: z.number().int().nullable(),
    ownerId: z.string(),
    method: z.string(),
    content: nullableString,
    status: z.string(),
    dueAt: nullableString,
    completedAt: nullableString,
    createdAt: z.string(),
    updatedAt: z.string(),
    ownerName: nullableString,
    customerName: nullableString,
  })
  .meta({ ref: 'CrmFollowUp' });

export const SuggestionSchema: z.ZodType<SuggestionView> = z
  .object({
    id: z.number().int(),
    customerId: z.number().int(),
    opportunityId: z.number().int().nullable(),
    followUpId: z.number().int().nullable(),
    kind: z.string(),
    title: z.string(),
    detail: nullableString,
    status: z.string(),
    decidedById: nullableString,
    decidedAt: nullableString,
    createdAt: z.string(),
    updatedAt: z.string(),
    customerName: nullableString,
  })
  .meta({ ref: 'CrmSuggestion' });

export const CustomerDetailSchema: z.ZodType<CustomerDetailView> = z
  .object({
    customer: CustomerSchema,
    contacts: z.array(ContactSchema),
    opportunities: z.array(OpportunitySchema),
    followUps: z.array(FollowUpSchema),
  })
  .meta({ ref: 'CrmCustomerDetail' });

export const DashboardSchema: z.ZodType<DashboardView> = z
  .object({
    stages: z.array(StageSummarySchema),
    totalOpportunities: z.number().int(),
    openAmount: z.number(),
    wonAmount: z.number(),
    lostCount: z.number().int(),
    customerCount: z.number().int(),
    pendingFollowUpCount: z.number().int(),
    overdueFollowUpCount: z.number().int(),
    pendingSuggestionCount: z.number().int(),
    followUpsThisWeek: z.array(FollowUpSchema),
    overdueFollowUps: z.array(FollowUpSchema),
  })
  .meta({ ref: 'CrmDashboard' });

export const GenerateSuggestionsResultSchema: z.ZodType<GenerateSuggestionsResult> =
  z.object({
    created: z.number().int(),
    suggestions: z.array(SuggestionSchema),
  });

export const ImportRowSchema: z.ZodType<ImportRowInput> = z
  .object({
    name: z.string().nullable().optional(),
    ownerId: z.string().nullable().optional(),
    industry: z.string().nullable().optional(),
    level: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .meta({ ref: 'CrmImportRow' });

export const ImportRowResultSchema: z.ZodType<ImportRowResult> = z.object({
  index: z.number().int(),
  status: z.enum(['valid', 'duplicate', 'error']),
  errors: z.array(z.string()),
  name: z.string(),
  duplicateOf: z.string().nullable(),
  row: ImportRowSchema,
});

export const ImportPreviewSchema: z.ZodType<ImportPreview> = z
  .object({
    total: z.number().int(),
    valid: z.number().int(),
    duplicate: z.number().int(),
    error: z.number().int(),
    rows: z.array(ImportRowResultSchema),
  })
  .meta({ ref: 'CrmImportPreview' });

export const ImportCommitResultSchema = z.object({
  created: z.number().int(),
  preview: ImportPreviewSchema,
});

export const PageMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

// --- Inputs -------------------------------------------------------------------------

export const CustomerIdParams = z.object({
  customerId: z.coerce.number().int().positive(),
});
export const ContactIdParams = z.object({
  contactId: z.coerce.number().int().positive(),
});
export const OpportunityIdParams = z.object({
  opportunityId: z.coerce.number().int().positive(),
});
export const FollowUpIdParams = z.object({
  followUpId: z.coerce.number().int().positive(),
});
export const SuggestionIdParams = z.object({
  suggestionId: z.coerce.number().int().positive(),
});

export const CustomerListQuery = z.object({
  search: z.string().optional(),
  level: z.enum(CUSTOMER_LEVELS).optional(),
  ownerId: z.string().optional(),
  sort: z.enum(['newest', 'oldest', 'name']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const ContactListQuery = z.object({
  customerId: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const OpportunityListQuery = z.object({
  customerId: z.coerce.number().int().positive().optional(),
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  ownerId: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(['newest', 'oldest', 'amount', 'expectedCloseDate']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const FollowUpListQuery = z.object({
  customerId: z.coerce.number().int().positive().optional(),
  status: z.enum(FOLLOW_UP_STATUSES).optional(),
  ownerId: z.string().optional(),
  overdueOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  sort: z.enum(['newest', 'oldest', 'dueAt']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const SuggestionListQuery = z.object({
  status: z.enum(SUGGESTION_STATUSES).optional(),
});

export const CreateCustomerInput = z.strictObject({
  name: z.string().min(1).max(200),
  ownerId: z.string().max(64).nullable().optional(),
  industry: z.string().max(100).nullable().optional(),
  level: z.enum(CUSTOMER_LEVELS).optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  website: z.string().max(300).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  source: z.string().max(100).nullable().optional(),
  notes: z.string().nullable().optional(),
});
export const UpdateCustomerInput = CreateCustomerInput.partial();

export const CreateContactInput = z.strictObject({
  customerId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  position: z.string().max(100).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});
export const UpdateContactInput = CreateContactInput.omit({
  customerId: true,
}).partial();

export const CreateOpportunityInput = z.strictObject({
  customerId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  amount: z.number().min(0).optional(),
  expectedCloseDate: z.string().nullable().optional(),
  lostReason: z.string().max(500).nullable().optional(),
  notes: z.string().nullable().optional(),
});
export const UpdateOpportunityInput = CreateOpportunityInput.omit({
  customerId: true,
}).partial();

export const CreateFollowUpInput = z.strictObject({
  customerId: z.number().int().positive(),
  opportunityId: z.number().int().positive().nullable().optional(),
  method: z.enum(FOLLOW_UP_METHODS).optional(),
  content: z.string().nullable().optional(),
  status: z.enum(FOLLOW_UP_STATUSES).optional(),
  dueAt: z.string().nullable().optional(),
});
export const UpdateFollowUpInput = CreateFollowUpInput.omit({
  customerId: true,
}).partial();

export const ImportCustomersInput = z.strictObject({
  rows: z.array(ImportRowSchema).min(1).max(500),
});

export const DecideSuggestionInput = z.strictObject({
  decision: z.enum(['approve', 'dismiss']),
});
