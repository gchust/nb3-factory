import type { DatabaseConnection } from '@nocobase/db';
import type { Translator } from '@nocobase/i18n/server';

export const TICKET_CATEGORIES = [
  'account',
  'hardware',
  'software',
  'network',
  'other',
] as const;

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export const TICKET_STATES = [
  'pending',
  'processing',
  'escalated',
  'resolved',
  'closed',
  'cancelled',
] as const;

export type TicketState = (typeof TICKET_STATES)[number];
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export interface TicketRecord {
  readonly id: string;
  readonly ticketNo: string;
  readonly title: string;
  readonly description: string;
  readonly category: TicketCategory;
  readonly priority: TicketPriority;
  readonly status: TicketState;
  readonly requesterId: string;
  readonly assigneeId: string | null;
  readonly resolution: string | null;
  readonly closeNote: string | null;
  readonly cancelReason: string | null;
  readonly statusChangedAt: Date;
  readonly lifecycleVersion: number;
  readonly resolvedAt: Date | null;
  readonly closedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly [field: string]: unknown;
}

export interface TicketNotificationTarget {
  id: string;
  ticketNo: string;
  title: string;
  status: TicketState;
  requesterId: string;
}

export interface TicketNotifier {
  assigned(
    ticket: TicketNotificationTarget,
    assigneeId: string,
    idempotencyKey: string,
  ): Promise<void>;
  started(
    ticket: TicketNotificationTarget,
    idempotencyKey: string,
  ): Promise<void>;
  resolved(
    ticket: TicketNotificationTarget,
    requesterId: string,
    idempotencyKey: string,
  ): Promise<void>;
  reopened(
    ticket: TicketNotificationTarget,
    requesterId: string,
    idempotencyKey: string,
  ): Promise<void>;
  closed(
    ticket: TicketNotificationTarget,
    requesterId: string,
    idempotencyKey: string,
  ): Promise<void>;
  cancelled(
    ticket: TicketNotificationTarget,
    requesterId: string,
    idempotencyKey: string,
  ): Promise<void>;
  escalated(
    ticket: TicketNotificationTarget,
    idempotencyKey: string,
  ): Promise<void>;
}

export interface TicketPeople {
  hasRole(userId: string, roleKey: string): Promise<boolean>;
  isRoot(userId: string): Promise<boolean>;
  listMembers(roleKey: string): Promise<{ id: string; name: string }[]>;
}

export interface TicketServices {
  database: DatabaseConnection;
  notifications: TicketNotifier;
  people: TicketPeople;
  translate: Translator;
  roleKeys: {
    employee: string;
    engineer: string;
    serviceDesk: string;
  };
}

export interface TicketTypes {
  record: TicketRecord;
  state: TicketState;
  parameters: { overdueHours: number };
  services: TicketServices;
}
