/** The visitor register's shared types and constants. This module exports no component. */

export const VISITOR_STATUSES = ['onSite', 'left'] as const;

export type VisitorStatus = (typeof VISITOR_STATUSES)[number];

/** A register row as the API returns it. */
export interface Visitor {
  readonly id: number;
  readonly name: string;
  readonly phone: string;
  readonly reason: string;
  readonly employeeName: string;
  readonly arrivedAt: string;
  readonly departedAt: string | null;
}

/** What the list page passes to its child routes (create dialog, checkout dialog) through `<Outlet context>`. */
export interface VisitorsOutletContext {
  /** Refreshes the list in the background, without clearing the filters. */
  readonly reload: () => void;
}

export function isVisitorStatus(value: string | null): value is VisitorStatus {
  return VISITOR_STATUSES.some((status) => status === value);
}
