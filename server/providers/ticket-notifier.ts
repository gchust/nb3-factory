import type { NotificationService } from '@nocobase/app-plugin-notification';

import type {
  TicketNotifierPort,
  TicketRecord,
  TicketRoleReader,
} from '../lifecycles/ticket-types.js';

/**
 * The messages are written in both of the application's languages in one string.
 *
 * A notification is stored before it is read, so there is no request locale to translate for: the recipient may open
 * the inbox in either language later. Sending both keeps a stored message readable whichever language it is read in.
 */
const URGENCY_LABEL: Readonly<Record<string, string>> = {
  low: '低 / low',
  normal: '普通 / normal',
  high: '高 / high',
  urgent: '紧急 / urgent',
};

function ticketLabel(record: TicketRecord): string {
  return `#${String(record.id).slice(0, 8)} ${record.title}`;
}

/**
 * Sends the ticket feature's in-app notifications.
 *
 * It owns the recipients rather than taking them from the caller: a transition decides *that* something happened,
 * and this decides *who* has to hear about it. The in-app channel is the only one configured, so `send` is called
 * with that one channel; adding mail later means adding a channel here, not changing the lifecycle.
 */
export class TicketNotifier implements TicketNotifierPort {
  constructor(
    private readonly roles: TicketRoleReader,
    private readonly resolveNotification: () => NotificationService | undefined,
  ) {}

  private async send(
    record: TicketRecord,
    recipients: readonly (string | null | undefined)[],
    idempotencyKey: string,
    title: string,
    body: string,
  ): Promise<void> {
    const to = [...new Set(recipients.filter((id): id is string => !!id))];
    if (to.length === 0) {
      return;
    }
    const notification = this.resolveNotification();
    if (!notification) {
      // The notification plugin is not registered. A ticket must still be usable, so this is not an error.
      return;
    }
    await notification.send({
      idempotencyKey,
      source: { type: 'ticket', referenceId: String(record.id) },
      messages: {
        inbox: {
          to: to.length === 1 ? to[0] : to,
          title,
          body,
          target: { type: 'route', path: `/tickets/${record.id}` },
        },
      },
    });
  }

  async created(record: TicketRecord, idempotencyKey: string): Promise<void> {
    const serviceDesk = await this.roles.serviceDeskUserIds();
    await this.send(
      record,
      serviceDesk,
      idempotencyKey,
      '新报修待分派 / New repair request awaiting assignment',
      `工单「${ticketLabel(record)}」由 ${record.reporterName} 提交，紧急程度 ${URGENCY_LABEL[record.urgency] ?? record.urgency}。 / Ticket "${ticketLabel(record)}" was reported by ${record.reporterName} (${URGENCY_LABEL[record.urgency] ?? record.urgency}).`,
    );
  }

  async assignment(
    record: TicketRecord,
    idempotencyKey: string,
  ): Promise<void> {
    await this.send(
      record,
      [record.assigneeId],
      idempotencyKey,
      '工单已分派给你 / A ticket is assigned to you',
      `工单「${ticketLabel(record)}」已分派给 ${record.assigneeName ?? record.assigneeId ?? ''}。 / Ticket "${ticketLabel(record)}" is assigned to ${record.assigneeName ?? record.assigneeId ?? ''}.`,
    );
  }

  async resolution(
    record: TicketRecord,
    idempotencyKey: string,
  ): Promise<void> {
    await this.send(
      record,
      [record.reporterId],
      idempotencyKey,
      '工单已处理，请确认 / Please confirm the resolution',
      `工单「${ticketLabel(record)}」已处理完成：${record.resolution ?? ''} / Ticket "${ticketLabel(record)}" was resolved: ${record.resolution ?? ''}`,
    );
  }

  async returned(
    record: TicketRecord,
    idempotencyKey: string,
    reason?: string,
  ): Promise<void> {
    await this.send(
      record,
      [record.assigneeId],
      idempotencyKey,
      '工单被退回继续处理 / A ticket was returned for further handling',
      `工单「${ticketLabel(record)}」的解决结果未被确认，请继续处理。${reason ? `原因：${reason}。` : ''} / Ticket "${ticketLabel(record)}" was not confirmed.${reason ? ` Reason: ${reason}.` : ''}`,
    );
  }

  async reopened(
    record: TicketRecord,
    idempotencyKey: string,
    reason?: string,
  ): Promise<void> {
    await this.send(
      record,
      [record.assigneeId],
      idempotencyKey,
      '工单已重新打开 / A ticket was reopened',
      `工单「${ticketLabel(record)}」已被重新打开，请继续处理。${reason ? `原因：${reason}。` : ''} / Ticket "${ticketLabel(record)}" was reopened.${reason ? ` Reason: ${reason}.` : ''}`,
    );
  }

  async closed(record: TicketRecord, idempotencyKey: string): Promise<void> {
    const serviceDesk = await this.roles.serviceDeskUserIds();
    await this.send(
      record,
      [record.assigneeId, ...serviceDesk],
      idempotencyKey,
      '工单已关闭 / Ticket closed',
      `工单「${ticketLabel(record)}」已由 ${record.reporterName} 确认关闭。 / Ticket "${ticketLabel(record)}" was confirmed and closed by ${record.reporterName}.`,
    );
  }

  async overdue(record: TicketRecord): Promise<void> {
    const serviceDesk = await this.roles.serviceDeskUserIds();
    await this.send(
      record,
      serviceDesk,
      `ticket-overdue:${record.id}:${record.overdueNotifiedAt ?? ''}`,
      '工单超时未解决 / Ticket overdue',
      `工单「${ticketLabel(record)}」提交后长时间未解决，请跟进。 / Ticket "${ticketLabel(record)}" has stayed unresolved for too long; please follow up.`,
    );
  }
}
