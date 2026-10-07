/**
 * Domain types for the CRM feature. These describe the rows the collections
 * hold and the shapes the routes return; the SQL columns live in the migration
 * `database/main/migrations/202610150001_create_crm_collections.ts` and the
 * record access scopes live in `server/crm/resources.ts`.
 */

export const CUSTOMER_LEVELS = ['A', 'B', 'C'] as const;
export type CustomerLevel = (typeof CUSTOMER_LEVELS)[number];

export const OPPORTUNITY_STAGES = [
  'initial_contact',
  'quote',
  'won',
  'lost',
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const FOLLOW_UP_METHODS = [
  'call',
  'visit',
  'email',
  'wechat',
  'other',
] as const;
export type FollowUpMethod = (typeof FOLLOW_UP_METHODS)[number];

export const FOLLOW_UP_STATUSES = ['pending', 'done', 'cancelled'] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const SUGGESTION_KINDS = [
  'overdue_followup',
  'stalled_opportunity',
  'high_value_opportunity',
  'idle_customer',
] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export const SUGGESTION_STATUSES = [
  'pending',
  'approved',
  'dismissed',
] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const CRM_COLLECTIONS = [
  'crmCustomers',
  'crmContacts',
  'crmOpportunities',
  'crmFollowUps',
  'crmSuggestions',
] as const;
export type CrmCollection = (typeof CRM_COLLECTIONS)[number];

export interface CustomerRow {
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

export interface ContactRow {
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

export interface OpportunityRow {
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

export interface FollowUpRow {
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

export interface SuggestionRow {
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

export interface CustomerView extends CustomerRow {
  ownerName: string | null;
}

export interface ContactView extends ContactRow {
  ownerName: string | null;
}

export interface OpportunityView extends OpportunityRow {
  ownerName: string | null;
  customerName: string | null;
}

export interface FollowUpView extends FollowUpRow {
  ownerName: string | null;
  customerName: string | null;
}

export interface SuggestionView extends SuggestionRow {
  customerName: string | null;
}

export interface CreateCustomerInput {
  name: string;
  ownerId?: string | null;
  industry?: string | null;
  level?: CustomerLevel;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  source?: string | null;
  notes?: string | null;
}

export type UpdateCustomerInput = Partial<CreateCustomerInput>;

export interface CreateContactInput {
  customerId: number;
  name: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
}

export type UpdateContactInput = Partial<
  Omit<CreateContactInput, 'customerId'>
>;

export interface CreateOpportunityInput {
  customerId: number;
  name: string;
  stage?: OpportunityStage;
  amount?: number;
  expectedCloseDate?: string | null;
  lostReason?: string | null;
  notes?: string | null;
}

export type UpdateOpportunityInput = Partial<
  Omit<CreateOpportunityInput, 'customerId'>
>;

export interface CreateFollowUpInput {
  customerId: number;
  opportunityId?: number | null;
  method?: FollowUpMethod;
  content?: string | null;
  status?: FollowUpStatus;
  dueAt?: string | null;
}

export type UpdateFollowUpInput = Partial<
  Omit<CreateFollowUpInput, 'customerId'>
>;

export interface ImportRowInput {
  name?: string | null;
  ownerId?: string | null;
  industry?: string | null;
  level?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  source?: string | null;
  notes?: string | null;
}

export const IMPORT_ROW_STATUSES = ['valid', 'duplicate', 'error'] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export interface ImportRowResult {
  /** 1-based position of the row in the submitted list. */
  index: number;
  status: ImportRowStatus;
  /** Field-level problems, present when `status` is `error`. */
  errors: string[];
  name: string;
  duplicateOf: string | null;
  row: ImportRowInput;
}

export interface ImportPreview {
  total: number;
  valid: number;
  duplicate: number;
  error: number;
  rows: ImportRowResult[];
}

export interface StageSummary {
  stage: OpportunityStage;
  count: number;
  amount: number;
}

export interface DashboardView {
  stages: StageSummary[];
  totalOpportunities: number;
  openAmount: number;
  wonAmount: number;
  lostCount: number;
  customerCount: number;
  pendingFollowUpCount: number;
  overdueFollowUpCount: number;
  pendingSuggestionCount: number;
  followUpsThisWeek: FollowUpView[];
  overdueFollowUps: FollowUpView[];
}

export interface CustomerDetailView {
  customer: CustomerView;
  contacts: ContactView[];
  opportunities: OpportunityView[];
  followUps: FollowUpView[];
}

export interface GenerateSuggestionsResult {
  created: number;
  suggestions: SuggestionView[];
}
