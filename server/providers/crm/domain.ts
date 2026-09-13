/**
 * CRM domain rules: the vocabulary the API accepts and the invariants it
 * enforces. Kept free of HTTP and database concerns so it can be tested on its
 * own.
 */

export const OPPORTUNITY_STAGES = [
  'lead',
  'following',
  'quoted',
  'won',
  'lost',
] as const;
export const CLOSED_OPPORTUNITY_STAGES = ['won', 'lost'] as const;
export const CUSTOMER_STATUSES = ['potential', 'active', 'lost'] as const;
export const CUSTOMER_SOURCES = ['online', 'referral', 'expo'] as const;
export const COMPANY_SIZES = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '500+',
] as const;
export const FOLLOW_UP_METHODS = ['phone', 'visit', 'email'] as const;
export const ATTACHMENT_TARGETS = ['customer', 'opportunity'] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
export type CustomerSource = (typeof CUSTOMER_SOURCES)[number];
export type FollowUpMethod = (typeof FOLLOW_UP_METHODS)[number];
export type AttachmentTarget = (typeof ATTACHMENT_TARGETS)[number];

export class CrmError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CrmError';
  }
}

export function badRequest(code: string, message: string): CrmError {
  return new CrmError(code, 400, message);
}

export function unprocessable(code: string, message: string): CrmError {
  return new CrmError(code, 422, message);
}

export interface JsonObject {
  readonly [key: string]: unknown;
}

export function asObject(value: unknown): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw badRequest('INVALID_BODY', 'A JSON object body is required.');
  }
  return value as JsonObject;
}

export function requiredString(
  value: unknown,
  code: string,
  message: string,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw badRequest(code, message);
  }
  return value.trim();
}

export function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  code: string,
): T | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw badRequest(code, 'Unsupported option value.');
  }
  return value as T;
}

export function requiredEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  code: string,
): T {
  const parsed = optionalEnum(value, allowed, code);
  if (parsed === null) {
    throw badRequest(code, 'A supported value is required.');
  }
  return parsed;
}

export function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw badRequest('INVALID_NUMBER', 'A finite number is required.');
  }
  return parsed;
}

export function optionalInteger(value: unknown): number | null {
  const parsed = optionalNumber(value);
  if (parsed === null) return null;
  if (!Number.isInteger(parsed)) {
    throw badRequest('INVALID_INTEGER', 'An integer is required.');
  }
  return parsed;
}

export function requiredId(value: unknown, code: string): number {
  const parsed = optionalInteger(value);
  if (parsed === null) {
    throw badRequest(code, 'A record id is required.');
  }
  return parsed;
}

export function optionalDate(value: unknown, code: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseDate(value);
  if (parsed === null) {
    throw badRequest(code, 'A valid date is required.');
  }
  return parsed;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const text = String(value).trim();
  // Database timestamps come back as epoch milliseconds, sometimes with a
  // fractional suffix, so an all-digit value is treated as epoch millis.
  if (/^\d+(\.\d+)?$/.test(text)) {
    const epoch = Number(text);
    return Number.isFinite(epoch) ? new Date(epoch) : null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export interface CustomerWritable {
  readonly name: string;
  readonly industry: string | null;
  readonly companySize: string | null;
  readonly source: CustomerSource | null;
  readonly status: CustomerStatus;
  readonly notes: string | null;
}

export function parseCustomerInput(
  body: JsonObject,
  options: { readonly requireName: boolean },
): CustomerWritable {
  const name =
    options.requireName || body.name !== undefined
      ? requiredString(
          body.name,
          'CUSTOMER_NAME_REQUIRED',
          'Customer name is required.',
        )
      : '';
  return {
    name,
    industry: optionalString(body.industry),
    companySize: optionalEnum(
      body.companySize,
      COMPANY_SIZES,
      'INVALID_COMPANY_SIZE',
    ),
    source: optionalEnum(body.source, CUSTOMER_SOURCES, 'INVALID_SOURCE'),
    status:
      body.status === undefined
        ? 'potential'
        : requiredEnum(body.status, CUSTOMER_STATUSES, 'INVALID_STATUS'),
    notes: optionalString(body.notes),
  };
}

export interface ContactWritable {
  readonly customerId: number;
  readonly name: string;
  readonly title: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly isPrimary: boolean;
}

export function parseContactInput(
  body: JsonObject,
  customerId: number,
): ContactWritable {
  return {
    customerId,
    name: requiredString(
      body.name,
      'CONTACT_NAME_REQUIRED',
      'Contact name is required.',
    ),
    title: optionalString(body.title),
    phone: optionalString(body.phone),
    email: optionalString(body.email),
    isPrimary: body.isPrimary === true,
  };
}

export interface OpportunityWritable {
  readonly name: string;
  readonly customerId: number;
  readonly amount: number | null;
  readonly stage: OpportunityStage;
  readonly expectedCloseDate: Date | null;
  readonly wonAmount: number | null;
  readonly lostReason: string | null;
}

export function parseOpportunityInput(
  body: JsonObject,
  customerId: number,
): OpportunityWritable {
  const stage = requiredEnum(body.stage, OPPORTUNITY_STAGES, 'INVALID_STAGE');
  const wonAmount = optionalNumber(body.wonAmount);
  const lostReason = optionalString(body.lostReason);

  if (stage === 'won' && wonAmount === null) {
    throw unprocessable(
      'WON_AMOUNT_REQUIRED',
      'A won opportunity requires the deal amount.',
    );
  }
  if (stage === 'lost' && lostReason === null) {
    throw unprocessable(
      'LOST_REASON_REQUIRED',
      'A lost opportunity requires a reason.',
    );
  }

  return {
    name: requiredString(
      body.name,
      'OPPORTUNITY_NAME_REQUIRED',
      'Opportunity name is required.',
    ),
    customerId,
    amount: optionalNumber(body.amount),
    stage,
    expectedCloseDate: optionalDate(
      body.expectedCloseDate,
      'INVALID_EXPECTED_CLOSE_DATE',
    ),
    wonAmount: stage === 'won' ? wonAmount : null,
    lostReason: stage === 'lost' ? lostReason : null,
  };
}

export interface FollowUpWritable {
  readonly method: FollowUpMethod;
  readonly summary: string;
  readonly nextStep: string | null;
  readonly followedAt: Date;
}

export function parseFollowUpInput(body: JsonObject): FollowUpWritable {
  return {
    method: requiredEnum(body.method, FOLLOW_UP_METHODS, 'INVALID_METHOD'),
    summary: requiredString(
      body.summary,
      'FOLLOW_UP_SUMMARY_REQUIRED',
      'A summary is required.',
    ),
    nextStep: optionalString(body.nextStep),
    followedAt:
      optionalDate(body.followedAt, 'INVALID_FOLLOWED_AT') ?? new Date(),
  };
}

export interface FunnelRow {
  readonly stage: string;
  readonly count: number;
  readonly total: number;
}

export interface FunnelStats {
  readonly byStage: readonly FunnelRow[];
  readonly totalCount: number;
  readonly totalAmount: number;
  readonly newThisMonth: number;
  readonly wonCount: number;
  readonly closedCount: number;
  readonly winRate: number | null;
}

export function computeFunnelStats(input: {
  readonly byStage: readonly FunnelRow[];
  readonly newThisMonth: number;
}): FunnelStats {
  const byStage = OPPORTUNITY_STAGES.map((stage) => {
    const row = input.byStage.find((item) => item.stage === stage);
    return {
      stage,
      count: row ? Number(row.count) : 0,
      total: row ? Number(row.total) : 0,
    };
  });
  const wonCount = byStage.find((item) => item.stage === 'won')?.count ?? 0;
  const lostCount = byStage.find((item) => item.stage === 'lost')?.count ?? 0;
  const closedCount = wonCount + lostCount;
  return {
    byStage,
    totalCount: byStage.reduce((sum, item) => sum + item.count, 0),
    totalAmount: byStage.reduce((sum, item) => sum + item.total, 0),
    newThisMonth: Number(input.newThisMonth),
    wonCount,
    closedCount,
    winRate: closedCount === 0 ? null : wonCount / closedCount,
  };
}

export function startOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
