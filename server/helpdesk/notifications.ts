import { APP_NS, type I18nRuntime } from '@nocobase/i18n';
import type { DatabaseManager } from '@nocobase/db';
import type { NotificationService } from '@nocobase/app-plugin-notification/server';

import { SERVICE_DESK_PERMISSION_SET } from './resources.js';
import type { Ticket } from './lifecycle.js';

/**
 * The lifecycle effects' view of notification delivery. A lifecycle effect never reaches into the notification
 * service itself: it asks for the people a transition concerns, and this class decides the wording and the recipient
 * list.
 */
export interface TicketNotifications {
  assigned(ticket: Ticket, idempotencyKey: string): Promise<void>;
  processingStarted(ticket: Ticket, idempotencyKey: string): Promise<void>;
  resolved(ticket: Ticket, idempotencyKey: string): Promise<void>;
  reopened(ticket: Ticket, idempotencyKey: string): Promise<void>;
  confirmed(ticket: Ticket, idempotencyKey: string): Promise<void>;
  overdue(ticket: Ticket, idempotencyKey: string): Promise<void>;
}

interface PermissionSetAssignment {
  readonly id: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly permissionSetKey: string;
}

/**
 * Sends the help desk's in-app notifications.
 *
 * Wording is fixed to the application's default language: notifications are produced outside a request, and the
 * language a signed-in user picked lives in their session rather than on the account, so there is no recipient
 * language to read here. Every send carries the effect's idempotency key, which makes a retried effect deliver once.
 */
export class HelpdeskNotifications implements TicketNotifications {
  constructor(
    private readonly notifications: NotificationService,
    private readonly database: DatabaseManager,
    private readonly i18n: I18nRuntime,
  ) {}

  async assigned(ticket: Ticket, idempotencyKey: string): Promise<void> {
    const t = await this.translator();
    await this.send({
      key: `${idempotencyKey}:assignee`,
      userIds: [ticket.assigneeId],
      ticketId: ticket.id,
      title: t('helpdesk.notifications.assignedToEngineer.title'),
      body: t('helpdesk.notifications.assignedToEngineer.body', {
        title: ticket.title,
        priority: ticket.priority,
      }),
    });
    await this.send({
      key: `${idempotencyKey}:reporter`,
      userIds: [ticket.reporterId],
      ticketId: ticket.id,
      title: t('helpdesk.notifications.assignedToReporter.title'),
      body: t('helpdesk.notifications.assignedToReporter.body', {
        title: ticket.title,
        assignee: ticket.assigneeName ?? '',
      }),
    });
  }

  async processingStarted(ticket: Ticket, idempotencyKey: string) {
    const t = await this.translator();
    await this.send({
      key: `${idempotencyKey}:reporter`,
      userIds: [ticket.reporterId],
      ticketId: ticket.id,
      title: t('helpdesk.notifications.processingStarted.title'),
      body: t('helpdesk.notifications.processingStarted.body', {
        title: ticket.title,
        assignee: ticket.assigneeName ?? '',
      }),
    });
  }

  async resolved(ticket: Ticket, idempotencyKey: string) {
    const t = await this.translator();
    await this.send({
      key: `${idempotencyKey}:reporter`,
      userIds: [ticket.reporterId],
      ticketId: ticket.id,
      title: t('helpdesk.notifications.resolved.title'),
      body: t('helpdesk.notifications.resolved.body', {
        title: ticket.title,
      }),
    });
  }

  async reopened(ticket: Ticket, idempotencyKey: string) {
    const t = await this.translator();
    await this.send({
      key: `${idempotencyKey}:assignee`,
      userIds: [ticket.assigneeId],
      ticketId: ticket.id,
      title: t('helpdesk.notifications.reopened.title'),
      body: t('helpdesk.notifications.reopened.body', {
        title: ticket.title,
        reason: ticket.reopenReason ?? '',
      }),
    });
  }

  async confirmed(ticket: Ticket, idempotencyKey: string) {
    const t = await this.translator();
    await this.send({
      key: `${idempotencyKey}:assignee`,
      userIds: [ticket.assigneeId],
      ticketId: ticket.id,
      title: t('helpdesk.notifications.confirmed.title'),
      body: t('helpdesk.notifications.confirmed.body', {
        title: ticket.title,
      }),
    });
  }

  async overdue(ticket: Ticket, idempotencyKey: string) {
    const t = await this.translator();
    await this.send({
      key: `${idempotencyKey}:service-desk`,
      userIds: await this.serviceDeskUserIds(),
      ticketId: ticket.id,
      title: t('helpdesk.notifications.overdue.title'),
      body: t('helpdesk.notifications.overdue.body', {
        title: ticket.title,
        priority: ticket.priority,
      }),
    });
  }

  private async translator() {
    const locale = this.i18n.getLocale();
    await this.i18n.ensureLocaleLoaded(locale);
    return this.i18n.getFixedT(APP_NS, locale);
  }

  /** Everyone the service-desk permission set is assigned to directly. */
  private async serviceDeskUserIds(): Promise<string[]> {
    const assignments = await this.database
      .repository<PermissionSetAssignment>(
        'authorizationPermissionSetAssignments',
      )
      .findMany({
        filter: {
          permissionSetKey: SERVICE_DESK_PERMISSION_SET,
          subjectType: 'user',
        },
        select: (select) => select.fields('subjectId'),
      });
    return assignments.map((assignment) => assignment.subjectId);
  }

  private async send(input: {
    key: string;
    userIds: readonly (string | null | undefined)[];
    title: string;
    body: string;
    ticketId: string;
  }): Promise<void> {
    const recipients = [
      ...new Set(
        input.userIds.filter(
          (id): id is string => typeof id === 'string' && id.length > 0,
        ),
      ),
    ];
    if (recipients.length === 0) return;
    const [first, ...rest] = recipients;
    await this.notifications.send({
      idempotencyKey: input.key,
      source: { type: 'helpdesk.ticket', referenceId: input.ticketId },
      messages: {
        inbox: {
          to: [first, ...rest],
          title: input.title,
          body: input.body,
          target: { type: 'route', path: `/tickets/${input.ticketId}` },
        },
      },
    });
  }
}
