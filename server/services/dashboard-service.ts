import type { DatabaseManager } from '@nocobase/db';
import type { AccessService } from './access-service.js';
import {
  TICKET_STATUS,
  type InspectionRow,
  type ServiceActor,
  type TicketRow,
} from './contracts.js';

export interface DashboardCounts {
  total: number;
  pendingAcceptance: number;
  pendingProcessing: number;
  processing: number;
  pendingConfirmation: number;
  closed: number;
  urgent: number;
  overdue: number;
  confidential: number;
}

export interface StatusBreakdownItem {
  status: string;
  count: number;
}

export interface DashboardResult {
  scope: 'all' | 'own';
  counts: DashboardCounts;
  byStatus: StatusBreakdownItem[];
  devicesDueInspection: number;
  pendingInspections: number;
  knowledgePublished: number;
  knowledgeDrafts: number;
}

function isOverdue(ticket: TicketRow, now: number): boolean {
  if (!ticket.dueAt || ticket.status === TICKET_STATUS.closed) {
    return false;
  }
  return new Date(ticket.dueAt).getTime() < now;
}

/**
 * Aggregates that back the dashboard. Supervisors read the whole queue;
 * engineers read their own workload.
 */
export class DashboardService {
  private readonly db: DatabaseManager;
  private readonly access: AccessService;

  constructor(db: DatabaseManager, access: AccessService) {
    this.db = db;
    this.access = access;
  }

  async getDashboard(actor: ServiceActor): Promise<DashboardResult> {
    this.access.assertStaff(actor);
    const ownOnly = actor.isEngineer && !actor.isRoot && !actor.isSupervisor;
    const tickets = await this.db
      .repository<TicketRow>('serviceTickets')
      .findMany({});
    const scoped = ownOnly
      ? tickets.filter((ticket) => ticket.assigneeId === actor.id)
      : tickets;
    const now = Date.now();

    const counts: DashboardCounts = {
      total: scoped.length,
      pendingAcceptance: 0,
      pendingProcessing: 0,
      processing: 0,
      pendingConfirmation: 0,
      closed: 0,
      urgent: 0,
      overdue: 0,
      confidential: 0,
    };
    for (const ticket of scoped) {
      if (ticket.status === TICKET_STATUS.pendingAcceptance)
        counts.pendingAcceptance += 1;
      if (ticket.status === TICKET_STATUS.pendingProcessing)
        counts.pendingProcessing += 1;
      if (ticket.status === TICKET_STATUS.processing) counts.processing += 1;
      if (ticket.status === TICKET_STATUS.pendingConfirmation)
        counts.pendingConfirmation += 1;
      if (ticket.status === TICKET_STATUS.closed) counts.closed += 1;
      if (ticket.priority === 'urgent') counts.urgent += 1;
      if (isOverdue(ticket, now)) counts.overdue += 1;
      if (ticket.confidential) counts.confidential += 1;
    }

    const byStatus: StatusBreakdownItem[] = (
      [
        TICKET_STATUS.pendingAcceptance,
        TICKET_STATUS.pendingProcessing,
        TICKET_STATUS.processing,
        TICKET_STATUS.pendingConfirmation,
        TICKET_STATUS.closed,
      ] as const
    ).map((status) => ({
      status,
      count: scoped.filter((ticket) => ticket.status === status).length,
    }));

    const devices = await this.db
      .repository<{
        id: number;
        enabled: boolean;
        nextInspectionDate?: string | null;
      }>('serviceDevices')
      .findMany({});
    const today = new Date().toISOString().slice(0, 10);
    const devicesDueInspection = devices.filter(
      (device) =>
        device.enabled &&
        device.nextInspectionDate &&
        device.nextInspectionDate <= today,
    ).length;

    const inspections = await this.db
      .repository<InspectionRow>('serviceInspections')
      .findMany({});
    const pendingInspections = inspections.filter(
      (inspection) => inspection.status === 'pending',
    ).length;

    const articles = await this.db
      .repository<{ id: number; published: boolean }>(
        'serviceKnowledgeArticles',
      )
      .findMany({});
    const knowledgePublished = articles.filter(
      (article) => article.published,
    ).length;
    const knowledgeDrafts = articles.length - knowledgePublished;

    return {
      scope: ownOnly ? 'own' : 'all',
      counts,
      byStatus,
      devicesDueInspection,
      pendingInspections,
      knowledgePublished,
      knowledgeDrafts,
    };
  }
}
