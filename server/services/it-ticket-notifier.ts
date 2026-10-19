import type { Logger } from '@nocobase/logging';
import type { NotificationService } from '@nocobase/app-plugin-notification/server';

import { ticketNumber } from '../it-ticket-domain.js';

export interface NotifiableTicket {
  readonly id: number;
  readonly title: string;
}

type Message = {
  readonly to: string | readonly [string, ...string[]];
  readonly title: string;
  readonly body: string;
  readonly target: { readonly type: 'route'; readonly path: string };
};

/**
 * Every in-app notification is bilingual: a recipient may have either language
 * selected, and the inbox stores the text rather than a translation key.
 */
export class ItTicketNotifier {
  constructor(
    private readonly notification: NotificationService,
    private readonly logger: Logger,
  ) {}

  async assigned(ticket: NotifiableTicket, assigneeId: string): Promise<void> {
    await this.send(
      `it-ticket-assigned-${ticket.id}-${assigneeId}`,
      [assigneeId],
      {
        title: `工单 ${ticketNumber(ticket.id)} 已分配 / Ticket ${ticketNumber(ticket.id)} assigned`,
        body: `“${ticket.title}”已分配给您，请及时处理。 / “${ticket.title}” is assigned to you.`,
        target: { type: 'route', path: `/it-tickets/${ticket.id}` },
      },
    );
  }

  async created(
    ticket: NotifiableTicket,
    serviceDeskIds: readonly string[],
  ): Promise<void> {
    await this.send(`it-ticket-created-${ticket.id}`, serviceDeskIds, {
      title: `新工单 ${ticketNumber(ticket.id)} / New ticket ${ticketNumber(ticket.id)}`,
      body: `“${ticket.title}”等待分配工程师。 / “${ticket.title}” is waiting for an engineer.`,
      target: { type: 'route', path: `/it-tickets/${ticket.id}` },
    });
  }

  async progress(ticket: NotifiableTicket, requesterId: string): Promise<void> {
    await this.send(
      `it-ticket-progress-${ticket.id}-${Date.now()}`,
      [requesterId],
      {
        title: `工单 ${ticketNumber(ticket.id)} 有新进展 / Ticket ${ticketNumber(ticket.id)} updated`,
        body: `工程师更新了“${ticket.title}”的处理进度。 / The engineer added a progress update to “${ticket.title}”.`,
        target: { type: 'route', path: `/it-tickets/${ticket.id}` },
      },
    );
  }

  async resolved(ticket: NotifiableTicket, requesterId: string): Promise<void> {
    await this.send(
      `it-ticket-resolved-${ticket.id}-${Date.now()}`,
      [requesterId],
      {
        title: `工单 ${ticketNumber(ticket.id)} 已处理 / Ticket ${ticketNumber(ticket.id)} resolved`,
        body: `“${ticket.title}”已处理完成，请确认关闭。 / “${ticket.title}” is resolved. Please confirm and close it.`,
        target: { type: 'route', path: `/it-tickets/${ticket.id}` },
      },
    );
  }

  async returned(ticket: NotifiableTicket, assigneeId: string): Promise<void> {
    await this.send(
      `it-ticket-returned-${ticket.id}-${Date.now()}`,
      [assigneeId],
      {
        title: `工单 ${ticketNumber(ticket.id)} 被退回 / Ticket ${ticketNumber(ticket.id)} returned`,
        body: `“${ticket.title}”未解决，已退回继续处理。 / “${ticket.title}” was returned for further handling.`,
        target: { type: 'route', path: `/it-tickets/${ticket.id}` },
      },
    );
  }

  async closed(
    ticket: NotifiableTicket,
    assigneeId: string | null,
  ): Promise<void> {
    if (!assigneeId) return;
    await this.send(`it-ticket-closed-${ticket.id}`, [assigneeId], {
      title: `工单 ${ticketNumber(ticket.id)} 已关闭 / Ticket ${ticketNumber(ticket.id)} closed`,
      body: `“${ticket.title}”已由报修人确认关闭。 / The requester confirmed and closed “${ticket.title}”.`,
      target: { type: 'route', path: `/it-tickets/${ticket.id}` },
    });
  }

  async overdue(
    ticket: NotifiableTicket,
    serviceDeskIds: readonly string[],
  ): Promise<boolean> {
    return this.send(`it-ticket-overdue-${ticket.id}`, serviceDeskIds, {
      title: `工单 ${ticketNumber(ticket.id)} 超时未解决 / Ticket ${ticketNumber(ticket.id)} overdue`,
      body: `“${ticket.title}”超过 24 小时仍未解决，请跟进。 / “${ticket.title}” has been unresolved for over 24 hours.`,
      target: { type: 'route', path: `/it-tickets/${ticket.id}` },
    });
  }

  /** Delivery must never roll back the ticket change that triggered it. */
  private async send(
    idempotencyKey: string,
    recipients: readonly string[],
    message: Omit<Message, 'to'>,
  ): Promise<boolean> {
    const to = [...new Set(recipients)].filter(Boolean);
    if (to.length === 0) return false;
    try {
      await this.notification.send({
        idempotencyKey,
        source: { type: 'it-ticket', referenceId: idempotencyKey },
        messages: {
          inbox: {
            to: to.length === 1 ? to[0] : (to as [string, ...string[]]),
            ...message,
          },
        },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `IT ticket notification failed for ${idempotencyKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}
