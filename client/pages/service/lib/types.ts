/**
 * The response shapes of the application's `/api/service/*` endpoints. These
 * describe what the server actually returns; they are not database models and
 * deliberately omit fields the server hides per caller (for example
 * `laborHours` disappears for a caller without `tickets.process`).
 */

export type ServiceCapabilities = Readonly<Record<string, boolean>>;

export interface ServiceCaller {
  readonly id: string;
  readonly name: string;
  readonly region: string | null;
  readonly capabilities: ServiceCapabilities;
}

export interface Bootstrap {
  readonly caller: ServiceCaller;
  readonly today: string;
}

export type TicketStatus =
  | 'draft'
  | 'pending_dispatch'
  | 'in_progress'
  | 'pending_confirmation'
  | 'closed'
  | 'cancelled';

export interface Ticket {
  readonly id: number;
  readonly ticketNo: string;
  readonly customerId: number;
  readonly deviceId: number;
  readonly title: string;
  readonly description: string | null;
  readonly priority: string;
  readonly status: TicketStatus;
  readonly region: string;
  readonly assigneeId: string | null;
  readonly confidential: boolean;
  readonly reporterId: string | null;
  readonly reporterName: string | null;
  readonly source: string;
  readonly externalEventId: string | null;
  readonly processNotes: string | null;
  readonly resolution: string | null;
  readonly laborHours?: number | string | null;
  readonly dueAt: string | null;
  readonly submittedAt: string | null;
  readonly assignedAt: string | null;
  readonly startedAt: string | null;
  readonly closedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Decorated by the list endpoint so a row names its customer and device. */
  readonly customerName?: string | null;
  readonly deviceName?: string | null;
  readonly deviceCode?: string | null;
}

export interface TicketLog {
  readonly id: number;
  readonly ticketId: number;
  readonly operatorId: string;
  readonly operatorName: string;
  readonly action: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly note: string | null;
  readonly reason: string | null;
  readonly laborHours: number | string | null;
  readonly createdAt: string;
}

export interface TicketShare {
  readonly id: number;
  readonly ticketId: number;
  readonly userId: string;
  readonly active: boolean;
  readonly revokedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ServiceFile {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string | null;
  readonly mimeType: string | null;
  readonly size: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Client-only: filled with the application-owned, access-checked byte URL. */
  contentUrl?: string;
}

export interface TicketDetail {
  readonly ticket: Ticket;
  readonly logs: readonly TicketLog[];
  readonly files: readonly ServiceFile[];
  readonly shares: readonly TicketShare[];
  readonly device: Device | null;
  readonly customer: Customer | null;
}

export interface Customer {
  readonly id: number;
  readonly name: string;
  readonly region: string;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly address: string | null;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerDetail {
  readonly customer: Customer;
  readonly devices: readonly Device[];
  readonly tickets: readonly Ticket[];
}

export interface Device {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly customerId: number;
  readonly region: string;
  readonly category: string | null;
  readonly model: string | null;
  readonly serialNumber: string | null;
  readonly ownerId: string | null;
  readonly enabled: boolean;
  readonly purchasedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly customerName?: string | null;
}

export interface KnowledgeArticle {
  readonly id: number;
  readonly title: string;
  readonly deviceCategory: string | null;
  readonly summary: string | null;
  readonly body: string | null;
  readonly status: string;
  readonly authorId: string | null;
  readonly viewCount: number;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface KnowledgeDetail {
  readonly article: KnowledgeArticle;
  readonly files: readonly ServiceFile[];
}

export interface InspectionTask {
  readonly id: number;
  readonly planId: number;
  readonly deviceId: number;
  readonly taskDate: string;
  readonly status: string;
  readonly assigneeId: string | null;
  readonly note: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deviceName?: string | null;
  readonly deviceCode?: string | null;
  readonly deviceRegion?: string | null;
}

export interface InspectionPlan {
  readonly id: number;
  readonly name: string;
  readonly cron: string;
  readonly timezone: string;
  readonly region: string | null;
  readonly enabled: boolean;
  readonly lastRunAt?: string | null;
}

export interface AutomationStep {
  readonly name: string;
  readonly status: 'succeeded' | 'failed' | 'skipped';
  readonly detail?: unknown;
  readonly error?: string | null;
}

export interface AutomationRun {
  readonly id: number;
  readonly ticketId: number;
  readonly kind: string;
  readonly status: string;
  readonly steps: readonly AutomationStep[] | null;
  readonly error: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly ticketNo?: string | null;
  readonly title?: string | null;
}

export interface JobRun {
  readonly id: number;
  readonly kind: string;
  readonly referenceId: number | null;
  readonly status: string;
  readonly result: unknown;
  readonly error: string | null;
  readonly triggeredBy: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface InspectionList {
  readonly date: string;
  readonly plans: readonly InspectionPlan[];
  readonly items: readonly InspectionTask[];
  readonly total: number;
}

export interface ServiceMember {
  readonly id: number;
  readonly userId: string;
  readonly region: string;
  readonly teamName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Client-facing display name, decorated by the server from the user row. */
  readonly userName?: string | null;
  /**
   * Whether this member may be picked as a ticket assignee: they belong to a
   * dispatchable region and hold the processing grant. The server decides it.
   */
  readonly assignable?: boolean;
}

export interface MemberCandidate {
  readonly id: string;
  readonly name: string | null;
  readonly username: string | null;
  readonly email: string | null;
}

export interface AssistantConversation {
  readonly id: number;
  readonly userId: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AssistantMessage {
  readonly id: number;
  readonly conversationId: number;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly context: unknown;
  readonly createdAt: string;
}

export interface AssistantDetail {
  readonly conversation: AssistantConversation;
  readonly messages: readonly AssistantMessage[];
}

export interface AssistantAnswer {
  readonly conversation: AssistantConversation;
  readonly question: AssistantMessage;
  readonly answer: AssistantMessage;
  readonly knowledge: readonly KnowledgeArticle[];
  readonly tickets: readonly Ticket[];
}

export interface DashboardSummary {
  readonly generatedAt: string;
  readonly byStatus: Readonly<Record<string, number>>;
  readonly byRegion: Readonly<Record<string, number>>;
  readonly byAssignee: readonly {
    readonly assigneeId: string;
    readonly name: string | null;
    readonly count: number;
  }[];
  readonly total: number;
  readonly open: number;
  readonly overdueInspections: number;
  readonly todayOpenInspections: number;
  readonly deviceCount: number;
  readonly recent: readonly Ticket[];
  readonly myTasks: readonly Ticket[];
}

export interface Paged<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
