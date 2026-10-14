import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';

import type { TicketNotification, TicketNotifier } from './lifecycle.js';

/** The Permission Set key that marks a person as service-desk staff. */
export const SERVICE_DESK_PERMISSION_SET = 'it-service-desk';

/** The Permission Set key that marks a person as a field engineer. */
export const ENGINEER_PERMISSION_SET = 'it-engineer';

/** The Channel name declared in `server/config/notification.ts`. */
const INBOX_CHANNEL = 'inbox';

/** Read a stored id without stringifying a value that could be an object. */
function asId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function titleFor(notification: TicketNotification): string {
  switch (notification.event) {
    case 'assigned':
      return `A ticket was assigned to you: ${notification.ticket.title}`;
    case 'resolved':
      return `Your ticket awaits confirmation: ${notification.ticket.title}`;
    case 'returned':
      return `A ticket was returned for further handling: ${notification.ticket.title}`;
    case 'closed':
      return `A ticket was closed: ${notification.ticket.title}`;
    case 'overdue':
      return `A ticket has been unresolved for over 24 hours: ${notification.ticket.title}`;
  }
}

function bodyFor(notification: TicketNotification): string {
  switch (notification.event) {
    case 'assigned':
      return `You are now handling "${notification.ticket.title}". Open the ticket to record the handling process.`;
    case 'resolved':
      return `The engineer recorded a solution for "${notification.ticket.title}". Confirm it to close the ticket, or return it for further handling.`;
    case 'returned':
      return `The reporter returned "${notification.ticket.title}" for further handling${notification.ticket.lastReturnReason ? `: ${notification.ticket.lastReturnReason}` : '.'}`;
    case 'closed':
      return `The reporter confirmed the solution for "${notification.ticket.title}". The ticket is closed.`;
    case 'overdue':
      return `"${notification.ticket.title}" has been unresolved for more than 24 hours. Assign or follow it up.`;
  }
}

/**
 * The `TicketNotifier` the lifecycle effects call. It resolves the notification service lazily, so it does not depend
 * on the notification provider having been registered first, and it never throws for an empty recipient list: an event
 * with nobody to tell is not a failed effect.
 */
export function createTicketNotifier(app: Application): TicketNotifier {
  const database = () => app.container.resolve(databaseManagerToken);

  const serviceDeskUserIds = async (): Promise<string[]> => {
    const assignments = await database()
      .repository('authorizationPermissionSetAssignments')
      .findMany({
        filter: {
          permissionSetKey: SERVICE_DESK_PERMISSION_SET,
          subjectType: 'user',
        },
      });
    return assignments.map((assignment) => asId(assignment.subjectId));
  };

  const recipientsFor = async (
    notification: TicketNotification,
  ): Promise<string[]> => {
    const { event, ticket } = notification;
    const ids = new Set<string>();
    switch (event) {
      case 'assigned':
      case 'returned':
        if (ticket.assigneeId) ids.add(ticket.assigneeId);
        break;
      case 'resolved':
      case 'closed':
        ids.add(ticket.reporterId);
        if (event === 'closed' && ticket.assigneeId) ids.add(ticket.assigneeId);
        break;
      case 'overdue':
        for (const id of await serviceDeskUserIds()) ids.add(id);
        break;
    }
    ids.delete('');
    return [...ids];
  };

  return {
    async notify(notification) {
      const recipients = await recipientsFor(notification);
      if (recipients.length === 0) return;

      const notificationService = app.container.resolve(
        notificationServiceToken,
      );
      await notificationService.send({
        idempotencyKey: notification.idempotencyKey,
        source: {
          type: 'it-service-desk-ticket',
          referenceId: String(notification.ticket.id),
        },
        messages: {
          [INBOX_CHANNEL]: {
            to: recipients,
            title: titleFor(notification),
            body: bodyFor(notification),
            target: {
              type: 'route',
              path: `/tickets/${notification.ticket.id}`,
            },
          },
        },
      });
    },
  };
}

/** Every user id holding the service-desk Permission Set, for the dashboard and routes. */
export async function listServiceDeskUserIds(
  app: Application,
): Promise<string[]> {
  const assignments = await app.container
    .resolve(databaseManagerToken)
    .repository('authorizationPermissionSetAssignments')
    .findMany({
      filter: {
        permissionSetKey: SERVICE_DESK_PERMISSION_SET,
        subjectType: 'user',
      },
    });
  return assignments.map((assignment) => asId(assignment.subjectId));
}

/** Every user id holding the engineer Permission Set. */
export async function listEngineerUserIds(app: Application): Promise<string[]> {
  const assignments = await app.container
    .resolve(databaseManagerToken)
    .repository('authorizationPermissionSetAssignments')
    .findMany({
      filter: {
        permissionSetKey: ENGINEER_PERMISSION_SET,
        subjectType: 'user',
      },
    });
  return assignments.map((assignment) => asId(assignment.subjectId));
}
