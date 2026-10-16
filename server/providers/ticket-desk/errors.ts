/**
 * The refusals the ticket desk makes on its own, before or beside the lifecycle's.
 *
 * A refusal carries an i18n *key*, not a sentence: the service runs outside any request and has no locale, so the route
 * that received the request is what translates it. `reason` is the stable code a client branches on and `kind` is the
 * category the route turns into an HTTP status — the service never names a status itself.
 */

export type TicketRefusalKind = 'invalid' | 'notFound' | 'denied' | 'conflict';

export interface TicketProblem {
  /** The request field the problem is with, such as `attachments[0].contentType`. */
  readonly field?: string;
  /** A key under `ticket.problem` in the application's server locale resources. */
  readonly messageKey: string;
}

export class TicketRefusal extends Error {
  readonly kind: TicketRefusalKind;
  readonly reason: string;
  readonly messageKey: string;
  readonly problems: readonly TicketProblem[];

  constructor(options: {
    readonly kind: TicketRefusalKind;
    readonly reason: string;
    readonly messageKey: string;
    readonly problems?: readonly TicketProblem[];
  }) {
    super(`${options.reason}: ${options.messageKey}`);
    this.name = 'TicketRefusal';
    this.kind = options.kind;
    this.reason = options.reason;
    this.messageKey = options.messageKey;
    this.problems = options.problems ?? [];
  }
}

export function isTicketRefusal(error: unknown): error is TicketRefusal {
  return error instanceof TicketRefusal;
}
