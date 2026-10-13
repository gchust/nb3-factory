/**
 * What the ticket pages pass down their `Outlet`.
 *
 * The list passes `TicketReloadOutletContext` to the create dialog so a created ticket appears behind the dialog.
 * The record page extends it for the transition dialogs: they also need the record's id and the version the screen
 * was rendered from, which the server compares so a stale screen cannot fire a transition.
 */
export interface TicketReloadOutletContext {
  readonly reload: () => void;
}

export interface TicketDetailOutletContext extends TicketReloadOutletContext {
  readonly ticketId: number;
  readonly version: number | null;
}

/**
 * Which transition leads the record page's actions. The first one the actor may fire is the page's single primary
 * button (guideline L2); the rest render beside it, and `cancel` sits behind the "…" menu.
 */
export const TRANSITION_ORDER = [
  'assign',
  'reassign',
  'start',
  'rework',
  'resolve',
  'confirm',
  'return',
] as const;
