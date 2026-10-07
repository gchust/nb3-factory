/**
 * Pure CRM rules: validating an imported customer list, and deriving the
 * assistant's suggestions from the records already in the database.
 *
 * Everything here is deliberately free of database and HTTP concerns so the
 * rules can be tested directly. `server/crm/service.ts` supplies the data.
 */

import {
  CUSTOMER_LEVELS,
  type CustomerLevel,
  type FollowUpRow,
  type ImportPreview,
  type ImportRowInput,
  type ImportRowResult,
  type OpportunityRow,
  type SuggestionKind,
} from './types.js';

/** How many recipients a single import may carry. */
export const IMPORT_ROW_LIMIT = 500;

/** Days without movement before an open opportunity is called stalled. */
export const STALLED_OPPORTUNITY_DAYS = 21;
/** Days without contact before a customer is called idle. */
export const IDLE_CUSTOMER_DAYS = 30;
/** Amount at or above which an open opportunity is called high value. */
export const HIGH_VALUE_AMOUNT = 500_000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OPEN_STAGES = new Set(['initial_contact', 'quote']);

export interface ImportValidationContext {
  /** Lower-cased, trimmed names of the customers the caller can already see. */
  existingNames: ReadonlySet<string>;
  /** Identifiers of the users a customer may be assigned to. */
  ownerIds: ReadonlySet<string>;
  /** The caller, used when a row omits `ownerId`. */
  defaultOwnerId: string;
  /** Whether the caller may assign a customer to someone else. */
  allowOwnerAssignment: boolean;
}

function normalizeName(name: string | null | undefined): string {
  return (name ?? '').trim();
}

function isCustomerLevel(value: string): value is CustomerLevel {
  return (CUSTOMER_LEVELS as readonly string[]).includes(value);
}

/**
 * Classifies every submitted row without touching the database.
 *
 * A row is `error` when a required value is missing or malformed, and
 * `duplicate` when its name matches an existing customer or an earlier valid
 * row in the same batch. Anything else is `valid`. Errors win: a row that is
 * both malformed and a duplicate is reported as an error.
 */
export function validateImportRows(
  rows: readonly ImportRowInput[],
  context: ImportValidationContext,
): ImportPreview {
  const names = new Set(context.existingNames);
  const results: ImportRowResult[] = [];

  rows.forEach((row, position) => {
    const index = position + 1;
    const name = normalizeName(row.name);
    const errors: string[] = [];

    if (!name) {
      errors.push('name');
    }
    if (row.level && !isCustomerLevel(row.level)) {
      errors.push('level');
    }
    if (row.email && !EMAIL_PATTERN.test(row.email.trim())) {
      errors.push('email');
    }
    if (row.ownerId) {
      if (!context.ownerIds.has(row.ownerId)) {
        errors.push('ownerId');
      } else if (
        !context.allowOwnerAssignment &&
        row.ownerId !== context.defaultOwnerId
      ) {
        errors.push('ownerId');
      }
    }

    if (errors.length > 0) {
      results.push({
        index,
        status: 'error',
        errors,
        name,
        duplicateOf: null,
        row,
      });
      return;
    }

    const key = name.toLowerCase();
    if (names.has(key)) {
      results.push({
        index,
        status: 'duplicate',
        errors: [],
        name,
        duplicateOf: name,
        row,
      });
      return;
    }

    names.add(key);
    results.push({
      index,
      status: 'valid',
      errors: [],
      name,
      duplicateOf: null,
      row,
    });
  });

  return {
    total: results.length,
    valid: results.filter((row) => row.status === 'valid').length,
    duplicate: results.filter((row) => row.status === 'duplicate').length,
    error: results.filter((row) => row.status === 'error').length,
    rows: results,
  };
}

export interface SuggestionDraft {
  customerId: number;
  opportunityId: number | null;
  followUpId: number | null;
  kind: SuggestionKind;
  title: string;
  detail: string;
}

export interface SuggestionEngineInput {
  now: Date;
  customers: readonly { id: number; name: string; ownerId: string }[];
  opportunities: readonly Pick<
    OpportunityRow,
    'id' | 'customerId' | 'name' | 'stage' | 'amount' | 'updatedAt'
  >[];
  followUps: readonly Pick<
    FollowUpRow,
    'id' | 'customerId' | 'dueAt' | 'status' | 'createdAt'
  >[];
}

function daysBetween(earlier: Date, later: Date): number {
  return (later.getTime() - earlier.getTime()) / 86_400_000;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    value,
  );
}

/**
 * Derives the assistant's suggestions from what is already in the database.
 *
 * The rules are deterministic on purpose: a supervisor can see exactly why a
 * customer was surfaced, and regenerating produces the same set. A suggestion
 * becomes a follow-up task only after the supervisor approves it.
 */
export function buildSuggestionDrafts(
  input: SuggestionEngineInput,
): SuggestionDraft[] {
  const now = input.now;
  const customerName = new Map(
    input.customers.map((customer) => [customer.id, customer.name]),
  );
  const lastFollowUp = new Map<number, Date>();
  for (const followUp of input.followUps) {
    const at = new Date(followUp.dueAt ?? followUp.createdAt);
    const previous = lastFollowUp.get(followUp.customerId);
    if (!previous || at > previous) {
      lastFollowUp.set(followUp.customerId, at);
    }
  }

  const drafts: SuggestionDraft[] = [];

  for (const followUp of input.followUps) {
    if (followUp.status !== 'pending' || !followUp.dueAt) continue;
    const due = new Date(followUp.dueAt);
    if (due.getTime() >= now.getTime()) continue;
    const name = customerName.get(followUp.customerId) ?? 'this customer';
    const overdueDays = Math.max(1, Math.round(daysBetween(due, now)));
    drafts.push({
      customerId: followUp.customerId,
      opportunityId: null,
      followUpId: followUp.id,
      kind: 'overdue_followup',
      title: `Follow up with ${name}`,
      detail: `The scheduled follow-up is ${overdueDays} day(s) overdue. Confirm the next step with the owner.`,
    });
  }

  for (const opportunity of input.opportunities) {
    if (!OPEN_STAGES.has(opportunity.stage)) continue;
    const name = customerName.get(opportunity.customerId) ?? 'this customer';
    const idleDays = Math.round(
      daysBetween(new Date(opportunity.updatedAt), now),
    );
    if (idleDays >= STALLED_OPPORTUNITY_DAYS) {
      drafts.push({
        customerId: opportunity.customerId,
        opportunityId: opportunity.id,
        followUpId: null,
        kind: 'stalled_opportunity',
        title: `Revive "${opportunity.name}" for ${name}`,
        detail: `No progress for ${idleDays} days. Agree on the next action to move it forward.`,
      });
    }
    if (opportunity.amount >= HIGH_VALUE_AMOUNT) {
      drafts.push({
        customerId: opportunity.customerId,
        opportunityId: opportunity.id,
        followUpId: null,
        kind: 'high_value_opportunity',
        title: `Focus on "${opportunity.name}" for ${name}`,
        detail: `Worth ${formatAmount(opportunity.amount)}. This is a key deal for the team.`,
      });
    }
  }

  for (const customer of input.customers) {
    const last = lastFollowUp.get(customer.id);
    if (!last || daysBetween(last, now) >= IDLE_CUSTOMER_DAYS) {
      const days = last
        ? Math.round(daysBetween(last, now))
        : IDLE_CUSTOMER_DAYS;
      drafts.push({
        customerId: customer.id,
        opportunityId: null,
        followUpId: null,
        kind: 'idle_customer',
        title: `Reach out to ${customer.name}`,
        detail: last
          ? `No contact for ${days} days. Schedule a check-in.`
          : 'No follow-up has ever been recorded. Schedule the first check-in.',
      });
    }
  }

  return drafts;
}

/** A stable key so regenerating does not duplicate a pending suggestion. */
export function suggestionKey(draft: {
  kind: string;
  customerId: number;
  opportunityId: number | null;
  followUpId: number | null;
}): string {
  return [
    draft.kind,
    draft.customerId,
    draft.opportunityId ?? 0,
    draft.followUpId ?? 0,
  ].join(':');
}
