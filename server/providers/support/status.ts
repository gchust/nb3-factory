import type { TicketStatus } from './constants.js';

export type TicketStatusAction =
  'start' | 'request-confirmation' | 'confirm' | 'reopen';

export interface StatusTransitionContext {
  readonly action: TicketStatusAction;
  readonly status: TicketStatus;
  /** True when the caller holds the staff role (agent or administrator). */
  readonly isStaff: boolean;
  /** True when the caller is the customer who opened the ticket. */
  readonly isCustomer: boolean;
}

export interface StatusTransition {
  readonly status: TicketStatus;
  /** Agents take ownership when they start working on a ticket. */
  readonly assignToSelf: boolean;
}

export const TICKET_STATUS_ACTIONS: readonly TicketStatusAction[] = [
  'start',
  'request-confirmation',
  'confirm',
  'reopen',
];

export function isTicketStatusAction(
  value: unknown,
): value is TicketStatusAction {
  return (
    typeof value === 'string' &&
    (TICKET_STATUS_ACTIONS as readonly string[]).includes(value)
  );
}

/**
 * The state machine that decides which status change an actor may make. It
 * returns `null` when the action is not legal for the current status and actor,
 * so the route can answer 409 without silently corrupting the ticket.
 */
export function resolveStatusTransition(
  context: StatusTransitionContext,
): StatusTransition | null {
  const { action, status, isStaff, isCustomer } = context;

  if (isStaff) {
    switch (action) {
      case 'start':
        return status === 'new'
          ? { status: 'in_progress', assignToSelf: true }
          : null;
      case 'request-confirmation':
        return status === 'in_progress'
          ? { status: 'pending_customer', assignToSelf: false }
          : null;
      case 'reopen':
        return status === 'pending_customer' || status === 'closed'
          ? { status: 'in_progress', assignToSelf: false }
          : null;
      case 'confirm':
        return null;
    }
  }

  if (isCustomer && action === 'confirm') {
    return status === 'pending_customer'
      ? { status: 'closed', assignToSelf: false }
      : null;
  }

  return null;
}
