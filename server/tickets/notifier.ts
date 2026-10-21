import type { NotificationService } from '@nocobase/app-plugin-notification/server';
import type { DatabaseManager } from '@nocobase/db';

import type { CommentView, TicketDetail, TicketListItem } from './service.js';

/**
 * Everything the ticket workflow tells people about. It is deliberately small and best-effort: a notification
 * failure must never roll back a ticket transition, so every method resolves and only the ticket itself decides
 * whether the operation succeeded.
 */
export interface TicketNotifier {
  created(ticket: TicketListItem, actorId: string): Promise<void>;
  assigned(ticket: TicketListItem, actorId: string): Promise<void>;
  commented(
    ticket: TicketListItem,
    comment: CommentView,
    actorId: string,
  ): Promise<void>;
  resolved(ticket: TicketDetail, actorId: string): Promise<void>;
  closed(ticket: TicketDetail, actorId: string): Promise<void>;
  reopened(ticket: TicketListItem, actorId: string): Promise<void>;
  remindOverdue(ticket: TicketListItem): Promise<void>;
}

export interface TicketNotifierOptions {
  readonly database: DatabaseManager;
  /** Undefined when the notification plugin is not part of this runtime. */
  readonly notifications?: NotificationService;
  /** The configured channel whose provider is `in-app`, such as `inbox`. */
  readonly channel?: string;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function excerpt(value: string, length = 180): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

/**
 * Sends ticket notices through the in-app notification channel. The channel is configured by name (usually
 * `inbox`); when no in-app channel is configured the notifier is a no-op, because the application may be deployed
 * without notifications.
 */
export function createTicketNotifier(
  options: TicketNotifierOptions,
): TicketNotifier {
  const { database, notifications, channel } = options;

  async function userIdsWithPermission(
    keys: readonly string[],
  ): Promise<string[]> {
    const rows = await database
      .connection()
      .query.selectFrom('authorizationPermissionSetAssignments')
      .select('subjectId')
      .where('subjectType', '=', 'user')
      .where('permissionSetKey', 'in', [...keys])
      .execute();
    return [...new Set(rows.map((row) => String(row.subjectId)))];
  }

  function serviceDeskIds(): Promise<string[]> {
    return userIdsWithPermission(['tickets-admin']);
  }

  async function send(
    idempotencyKey: string,
    recipients: readonly (string | null | undefined)[],
    ticket: TicketListItem,
    title: string,
    body: string,
  ): Promise<void> {
    const to = [...new Set(recipients.filter((id): id is string => !!id))];
    if (!notifications || !channel || to.length === 0) return;
    try {
      await notifications.send({
        idempotencyKey,
        source: { type: 'support.tickets', referenceId: ticket.id },
        messages: {
          [channel]: {
            to,
            title,
            body,
            target: { type: 'route', path: `/tickets/${ticket.id}` },
          },
        },
      });
    } catch {
      // A missing inbox, a deleted recipient or a temporary provider failure is not a reason to reject the
      // business operation the person just completed.
    }
  }

  const ticketLabel = (ticket: TicketListItem) =>
    `${ticket.ticketNo}: ${ticket.title}`;

  return {
    async created(ticket, actorId) {
      await send(
        `support.ticket.created:${ticket.id}`,
        (await serviceDeskIds()).filter((id) => id !== actorId),
        ticket,
        `New service ticket ${ticket.ticketNo}`,
        `${ticketLabel(ticket)} was submitted by ${
          ticket.requester?.name || 'an employee'
        }. Priority: ${ticket.priority}.`,
      );
    },

    async assigned(ticket, actorId) {
      await send(
        `support.ticket.assigned:${ticket.id}:${ticket.assigneeId}:${ticket.updatedAt}`,
        [
          ticket.assigneeId === actorId ? null : ticket.assigneeId,
          ticket.requesterId === actorId ? null : ticket.requesterId,
        ],
        ticket,
        `Ticket ${ticket.ticketNo} assigned to ${
          ticket.assignee?.name || 'an engineer'
        }`,
        `${ticketLabel(ticket)} is now being handled by ${
          ticket.assignee?.name || 'an engineer'
        }.`,
      );
    },

    async commented(ticket, comment, actorId) {
      if (comment.internal) return;
      const recipients =
        actorId === ticket.requesterId
          ? ticket.assigneeId
            ? [ticket.assigneeId]
            : await serviceDeskIds()
          : [ticket.requesterId];
      await send(
        `support.ticket.comment:${comment.id}`,
        recipients.filter((id) => id !== actorId),
        ticket,
        actorId === ticket.requesterId
          ? `New reply on ${ticket.ticketNo}`
          : `Resolution update on ${ticket.ticketNo}`,
        excerpt(comment.body),
      );
    },

    async resolved(ticket, actorId) {
      await send(
        `support.ticket.resolved:${ticket.id}:${ticket.resolvedAt}`,
        [ticket.requesterId === actorId ? null : ticket.requesterId],
        ticket,
        `Ticket ${ticket.ticketNo} is resolved`,
        `Please review the resolution for ${ticketLabel(
          ticket,
        )} and confirm it to close the ticket, or reopen it if the problem is not solved.`,
      );
    },

    async closed(ticket, actorId) {
      await send(
        `support.ticket.closed:${ticket.id}:${ticket.closedAt}`,
        [
          ticket.assigneeId === actorId ? null : ticket.assigneeId,
          ...(await serviceDeskIds()),
        ],
        ticket,
        `Ticket ${ticket.ticketNo} confirmed and closed`,
        `${ticketLabel(ticket)} was confirmed as resolved by the requester.`,
      );
    },

    async reopened(ticket, actorId) {
      await send(
        `support.ticket.reopened:${ticket.id}:${ticket.updatedAt}`,
        [
          ticket.assigneeId === actorId ? null : ticket.assigneeId,
          ...(await serviceDeskIds()),
        ],
        ticket,
        `Ticket ${ticket.ticketNo} reopened`,
        `${ticketLabel(
          ticket,
        )} was reopened by the requester and needs more work.`,
      );
    },

    async remindOverdue(ticket) {
      await send(
        `support.ticket.overdue:${ticket.id}:${dayKey(new Date())}`,
        await serviceDeskIds(),
        ticket,
        `Overdue ticket ${ticket.ticketNo}`,
        `${ticketLabel(ticket)} has been unresolved for more than 24 hours.`,
      );
    },
  };
}

export const noopTicketNotifier: TicketNotifier = {
  async created() {},
  async assigned() {},
  async commented() {},
  async resolved() {},
  async closed() {},
  async reopened() {},
  async remindOverdue() {},
};
