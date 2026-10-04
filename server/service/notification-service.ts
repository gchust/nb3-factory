import type { NotificationService } from '@nocobase/app-plugin-notification/server';

import type { Inspection, Ticket } from './domain.js';
import type { TicketNotifier } from './ticket-service.js';

export interface ServiceNotifier extends TicketNotifier {
  ticketEscalated(ticket: Ticket, engineerName: string): Promise<void>;
  ticketOverdue(items: readonly Ticket[]): Promise<void>;
  inspectionOverdue(
    items: readonly (Inspection & { deviceNo?: string })[],
  ): Promise<void>;
  inspectionPlanned(count: number): Promise<void>;
}

/**
 * Turns ticket and inspection changes into durable in-app messages.
 *
 * The manager is optional: an installation without the notification plugin
 * keeps working, and a delivery failure is reported but never fails the
 * business operation that triggered it.
 */
export function createServiceNotifier(
  notification: NotificationService | undefined,
): ServiceNotifier {
  async function sendInbox(input: {
    idempotencyKey: string;
    source: { type: string; referenceId?: string };
    to: readonly string[];
    title: string;
    body: string;
    path: string;
  }): Promise<void> {
    if (!notification || input.to.length === 0) return;
    try {
      await notification.send({
        idempotencyKey: input.idempotencyKey,
        source: input.source,
        messages: {
          inbox: {
            to: [...input.to],
            title: input.title,
            body: input.body,
            target: { type: 'route', path: input.path },
          },
        },
      });
    } catch (error) {
      console.warn(
        `[service] in-app notification ${input.idempotencyKey} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return {
    async ticketAccepted(ticket, engineerName) {
      const recipients = [ticket.reporterId, ticket.assigneeId]
        .filter((id): id is number => typeof id === 'number')
        .map(String);
      await sendInbox({
        idempotencyKey: `service-ticket-accepted-${ticket.id}-${ticket.assigneeId ?? 'none'}`,
        source: {
          type: 'service.ticket.accepted',
          referenceId: String(ticket.id),
        },
        to: recipients,
        title: `工单已受理：${ticket.ticketNo}`,
        body: `工单「${ticket.title}」已由 ${engineerName} 受理。`,
        path: `/service/tickets/${ticket.id}`,
      });
    },

    async ticketEscalated(ticket, engineerName) {
      await sendInbox({
        idempotencyKey: `service-ticket-escalated-${ticket.id}`,
        source: {
          type: 'service.ticket.escalated',
          referenceId: String(ticket.id),
        },
        to: [String(ticket.assigneeId ?? '')].filter(Boolean),
        title: `紧急工单升级：${ticket.ticketNo}`,
        body: `紧急工单「${ticket.title}」已升级并指派给 ${engineerName}。`,
        path: `/service/tickets/${ticket.id}`,
      });
    },

    async ticketSubmitted(ticket) {
      await sendInbox({
        idempotencyKey: `service-ticket-submitted-${ticket.id}`,
        source: {
          type: 'service.ticket.submitted',
          referenceId: String(ticket.id),
        },
        to: [String(ticket.reporterId ?? '')].filter(Boolean),
        title: `工单待确认：${ticket.ticketNo}`,
        body: `工单「${ticket.title}」已提交，请确认处理结果。`,
        path: `/service/tickets/${ticket.id}`,
      });
    },

    async ticketClosed(ticket) {
      await sendInbox({
        idempotencyKey: `service-ticket-closed-${ticket.id}`,
        source: {
          type: 'service.ticket.closed',
          referenceId: String(ticket.id),
        },
        to: [String(ticket.assigneeId ?? '')].filter(Boolean),
        title: `工单已关闭：${ticket.ticketNo}`,
        body: `工单「${ticket.title}」已关闭。`,
        path: `/service/tickets/${ticket.id}`,
      });
    },

    async ticketShared(ticket, granteeId) {
      await sendInbox({
        idempotencyKey: `service-ticket-shared-${ticket.id}-${granteeId}`,
        source: {
          type: 'service.ticket.shared',
          referenceId: String(ticket.id),
        },
        to: [String(granteeId)],
        title: `工单已共享：${ticket.ticketNo}`,
        body: `工单「${ticket.title}」已临时共享给你。`,
        path: `/service/tickets/${ticket.id}`,
      });
    },

    async ticketOverdue(items) {
      const day = new Date().toISOString().slice(0, 10);
      for (const ticket of items) {
        const recipient = ticket.assigneeId ?? ticket.reporterId;
        if (recipient == null) continue;
        await sendInbox({
          idempotencyKey: `service-ticket-overdue-${ticket.id}-${day}`,
          source: {
            type: 'service.ticket.overdue',
            referenceId: String(ticket.id),
          },
          to: [String(recipient)],
          title: `工单已超期：${ticket.ticketNo}`,
          body: `工单「${ticket.title}」已超过处理时限，请尽快处理。`,
          path: `/service/tickets/${ticket.id}`,
        });
      }
    },

    async inspectionOverdue(items) {
      for (const item of items) {
        if (item.assigneeId == null) continue;
        await sendInbox({
          idempotencyKey: `service-inspection-overdue-${item.id}-${item.plannedDate}`,
          source: {
            type: 'service.inspection.overdue',
            referenceId: String(item.id),
          },
          to: [String(item.assigneeId)],
          title: `巡检已逾期：${item.deviceNo ?? item.deviceId}`,
          body: `计划日期 ${item.plannedDate} 的设备巡检仍未完成，请尽快处理。`,
          path: '/service/inspections',
        });
      }
    },

    async inspectionPlanned(count) {
      if (count <= 0) return;
      await sendInbox({
        idempotencyKey: `service-inspection-planned-${new Date().toISOString().slice(0, 10)}`,
        source: { type: 'service.inspection.planned' },
        to: [],
        title: `今日新增 ${count} 条巡检计划`,
        body: `计划任务已为 ${count} 台设备创建巡检计划。`,
        path: '/service/inspections',
      });
    },
  };
}
