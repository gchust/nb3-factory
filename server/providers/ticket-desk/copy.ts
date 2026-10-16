/**
 * What the ticket desk tells people, as keys rather than sentences.
 *
 * A notification leaves the process, so it cannot use the language of whoever triggered it — it is rendered in the
 * application's default locale, whatever the desks and engineers reading it have chosen in the browser. The route that
 * received the request uses the request's own translator instead; both read the same keys from
 * `server/locales/*`, which is where the wording lives.
 */
import type { Translator } from '@nocobase/i18n/server';

import type {
  TicketNotificationEvent,
  TicketRecord,
} from '../../lifecycles/ticket.js';
import type { NotificationTarget } from '@nocobase/app-plugin-notification';

export interface TicketNotificationContent {
  readonly title: string;
  readonly body: string;
  /** Where the notification leads: the ticket's own page. */
  readonly target: NotificationTarget;
}

/** `pending`, `assigned` … as a person reads it. */
export function stateLabel(translate: Translator, state: string): string {
  return translate(`ticket.state.${state}`);
}

/** `low`, `normal` … as a person reads it. */
export function urgencyLabel(translate: Translator, urgency: string): string {
  return translate(`ticket.urgency.${urgency}`);
}

/**
 * The title and body of one notification.
 *
 * Every event names the ticket by its number and title, and every one links to the ticket, because a notification that
 * does not say which ticket it is about and cannot be opened from is not worth sending.
 */
export function notificationContent(
  translate: Translator,
  event: TicketNotificationEvent,
  record: TicketRecord,
): TicketNotificationContent {
  const values = {
    id: Number(record.id),
    title: record.title,
    urgency: urgencyLabel(translate, record.urgency),
    state: stateLabel(translate, record.status),
    reason: record.lastReason ?? '',
    assignee: record.assigneeName ?? '',
  };

  return {
    title: translate(`ticket.notify.${event}.title`, values),
    body: translate(`ticket.notify.${event}.body`, values),
    target: { type: 'route', path: `/tickets/${Number(record.id)}` },
  };
}
