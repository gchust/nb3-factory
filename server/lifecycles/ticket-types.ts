import type { LifecycleRecord, LifecycleTypes } from '@nocobase/lifecycle';

/**
 * The states a repair ticket moves through. The names are the lifecycle's, and they are also what the `status`
 * column holds, so a page, a query and the diagram all read the same value.
 */
export type TicketState =
  'submitted' | 'assigned' | 'inProgress' | 'resolved' | 'closed';

/** How soon the reporter needs it fixed. Stored as a string so a level can be added without an `alter` on SQLite. */
export type TicketUrgency = 'low' | 'normal' | 'high' | 'urgent';

/** The record the ticket lifecycle runs on. Every field here is a column the migration created. */
export interface TicketRecord extends LifecycleRecord {
  title: string;
  description?: string | null;
  category?: string | null;
  urgency: TicketUrgency;

  /** The lifecycle's state field. */
  status: TicketState;
  /** The lifecycle's changed-at field; the runtime rewrites it on every transition. */
  statusChangedAt: string;
  /** The lifecycle's version field; the runtime increments it on every transition. */
  lifecycleVersion: number;

  reporterId: string;
  reporterName: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
  resolution?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  reopenCount: number;
  lastReopenedAt?: string | null;
  /** When the overdue sweep last reminded the service desk about this ticket. */
  overdueNotifiedAt?: string | null;
  /** The file the reporter attached, if any. */
  attachmentId?: string | null;

  createdAt: string;
  updatedAt: string;
}

/** The defaults the lifecycle carries; they are read-only in the management page. */
export interface TicketParameters {
  /** How long a ticket may stay unresolved before the sweep reminds the service desk. */
  overdueHours: number;
  /** How many times a reporter may reopen a closed ticket before the service desk has to take over. */
  maxReopenCount: number;
}

/**
 * Reading a person's business role. A guard runs inside the lifecycle's transaction and an effect runs after it, so
 * the reader is built around the transaction handle the runtime supplies rather than around the request.
 */
export interface TicketRoleReader {
  isAdmin(userId: string): Promise<boolean>;
  isServiceDesk(userId: string): Promise<boolean>;
  isEngineer(userId: string): Promise<boolean>;
  /** The people the service desk's own reminders go to. */
  serviceDeskUserIds(): Promise<string[]>;
  /** The people the service desk can hand a ticket to. */
  engineerUserIds(): Promise<string[]>;
}

/** The notifications the ticket lifecycle and its sweep send. */
export interface TicketNotifierPort {
  created(record: TicketRecord, idempotencyKey: string): Promise<void>;
  assignment(record: TicketRecord, idempotencyKey: string): Promise<void>;
  resolution(record: TicketRecord, idempotencyKey: string): Promise<void>;
  returned(
    record: TicketRecord,
    idempotencyKey: string,
    reason?: string,
  ): Promise<void>;
  reopened(
    record: TicketRecord,
    idempotencyKey: string,
    reason?: string,
  ): Promise<void>;
  closed(record: TicketRecord, idempotencyKey: string): Promise<void>;
  overdue(record: TicketRecord): Promise<void>;
}

/** Everything the lifecycle's guards and effects may reach. */
export interface TicketServices {
  readonly roles: TicketRoleReader;
  readonly notify: TicketNotifierPort;
}

/** The ticket lifecycle's four type arguments, named once. */
export interface TicketTypes extends LifecycleTypes {
  record: TicketRecord;
  state: TicketState;
  parameters: TicketParameters;
  services: TicketServices;
}
