import type { NotificationService } from '@nocobase/app-plugin-notification/server';
import type { I18nRuntime } from '@nocobase/i18n/server';
import type {
  TicketNotificationTarget,
  TicketNotifier,
  TicketPeople,
} from './types.js';

const route = (ticket: TicketNotificationTarget) => ({
  type: 'route' as const,
  path: `/tickets/${ticket.id}`,
});

export class InAppTicketNotifier implements TicketNotifier {
  constructor(
    private readonly notification: NotificationService,
    private readonly people: TicketPeople,
    private readonly serviceDeskRoleKey: string,
    private readonly i18n: I18nRuntime,
  ) {}

  private async text(
    ticket: TicketNotificationTarget,
    key: string,
  ): Promise<{ title: string; body: string }> {
    const locale = this.i18n.getDefaultLocale();
    await this.i18n.ensureLocaleLoaded(locale);
    const t = this.i18n.getFixedT('nb3-factory', locale);
    return {
      title: t(`helpdesk.notifications.${key}`, { ticketNo: ticket.ticketNo }),
      body: t('helpdesk.notifications.subject', {
        ticketNo: ticket.ticketNo,
        title: ticket.title,
      }),
    };
  }

  private async send(
    to: string | readonly string[],
    idempotencyKey: string,
    ticket: TicketNotificationTarget,
    title: string,
    body: string,
    sourceType: string,
  ): Promise<void> {
    const recipients = (typeof to === 'string' ? [to] : [...to]).filter((id) =>
      Boolean(id),
    );
    const [first, ...rest] = recipients;
    if (!first) return;

    await this.notification.send({
      idempotencyKey,
      source: { type: sourceType, referenceId: ticket.id },
      messages: {
        inbox: {
          to: rest.length === 0 ? first : [first, ...rest],
          title,
          body,
          target: route(ticket),
        },
      },
    });
  }

  async assigned(
    ticket: TicketNotificationTarget,
    assigneeId: string,
    idempotencyKey: string,
  ): Promise<void> {
    const { title, body } = await this.text(ticket, 'assigned');
    await this.send(
      assigneeId,
      `${idempotencyKey}:assigned`,
      ticket,
      title,
      body,
      'helpdesk.ticket.assigned',
    );
  }

  async started(
    ticket: TicketNotificationTarget,
    idempotencyKey: string,
  ): Promise<void> {
    const { title, body } = await this.text(ticket, 'started');
    await this.send(
      ticket.requesterId,
      `${idempotencyKey}:started`,
      ticket,
      title,
      body,
      'helpdesk.ticket.started',
    );
  }

  private async notifyRequester(
    ticket: TicketNotificationTarget,
    requesterId: string,
    idempotencyKey: string,
    suffix: string,
    sourceType: string,
  ): Promise<void> {
    const message = await this.text(ticket, suffix);
    await this.send(
      requesterId,
      `${idempotencyKey}:${suffix}`,
      ticket,
      message.title,
      message.body,
      sourceType,
    );
  }

  async resolved(
    ticket: TicketNotificationTarget,
    requesterId: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.notifyRequester(
      ticket,
      requesterId,
      idempotencyKey,
      'resolved',
      'helpdesk.ticket.resolved',
    );
  }

  async reopened(
    ticket: TicketNotificationTarget,
    requesterId: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.notifyRequester(
      ticket,
      requesterId,
      idempotencyKey,
      'reopened',
      'helpdesk.ticket.reopened',
    );
  }

  async closed(
    ticket: TicketNotificationTarget,
    requesterId: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.notifyRequester(
      ticket,
      requesterId,
      idempotencyKey,
      'closed',
      'helpdesk.ticket.closed',
    );
  }

  async cancelled(
    ticket: TicketNotificationTarget,
    requesterId: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.notifyRequester(
      ticket,
      requesterId,
      idempotencyKey,
      'cancelled',
      'helpdesk.ticket.cancelled',
    );
  }

  async escalated(
    ticket: TicketNotificationTarget,
    idempotencyKey: string,
  ): Promise<void> {
    const [members, { title, body }] = await Promise.all([
      this.people.listMembers(this.serviceDeskRoleKey),
      this.text(ticket, 'escalated'),
    ]);
    await this.send(
      members.map((member) => member.id),
      `${idempotencyKey}:escalated`,
      ticket,
      title,
      body,
      'helpdesk.ticket.escalated',
    );
  }
}
