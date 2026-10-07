/**
 * The CRM shapes the pages read. They mirror the JSON the `/api/crm` routes
 * return (`server/routes/schemas.ts`); the client keeps its own copy, as the
 * browser bundle must not import server code.
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

export type SuggestionStatus = 'pending' | 'approved' | 'dismissed';

export interface CustomerView {
  id: number;
  name: string;
  ownerId: string;
  ownerName: string | null;
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

export interface ContactView {
  id: number;
  customerId: number;
  ownerId: string;
  ownerName: string | null;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityView {
  id: number;
  customerId: number;
  ownerId: string;
  ownerName: string | null;
  customerName: string | null;
  name: string;
  stage: string;
  amount: number;
  expectedCloseDate: string | null;
  lostReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUpView {
  id: number;
  customerId: number;
  opportunityId: number | null;
  ownerId: string;
  ownerName: string | null;
  customerName: string | null;
  method: string;
  content: string | null;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SuggestionView {
  id: number;
  customerId: number;
  opportunityId: number | null;
  followUpId: number | null;
  ownerId: string;
  customerName: string | null;
  kind: string;
  title: string;
  detail: string | null;
  status: string;
  decidedById: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: ListMeta;
}

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

export interface ImportRowResult {
  index: number;
  status: 'valid' | 'duplicate' | 'error';
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

export interface ImportCommitResult {
  created: number;
  preview: ImportPreview;
}

export interface GenerateSuggestionsResult {
  created: number;
  suggestions: SuggestionView[];
}
