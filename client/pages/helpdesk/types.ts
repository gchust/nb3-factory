/** Values shared by the helpdesk pages. Kept structural so a response change is visible here. */

export type TicketStatus = 'open' | 'processing' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketCategory =
  'hardware' | 'software' | 'network' | 'access' | 'other';

export interface Ticket {
  id: string;
  ticketNo: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  reporterId: string;
  assigneeId?: string | null;
  resolution?: string | null;
  createdAt: string;
  updatedAt: string;
  statusChangedAt: string;
  lifecycleVersion?: number;
}

export interface TicketRow extends Ticket {
  reporterName?: string | null;
  assigneeName?: string | null;
  commentCount?: number;
  attachmentCount?: number;
}

export interface LifecycleBlocker {
  source: 'state' | 'guard' | 'manual';
  kind: 'permission' | 'precondition';
  code: string;
  message: string;
}

export interface AvailableTransition {
  name: string;
  title: string;
  to: string[];
  allowed: boolean;
  blockers: LifecycleBlocker[];
}

export interface LifecycleHistoryEntry {
  id: number;
  lifecycle: string;
  recordId: string;
  transition: string;
  from?: string | null;
  to: string;
  actorId: string;
  actorName?: string | null;
  input?: Readonly<Record<string, unknown>>;
  at: string;
  version: number;
  requestId?: string | null;
}

export interface LifecycleEffectRun {
  id: number;
  transitionId: number;
  lifecycle: string;
  recordId: string;
  effect: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  result?: unknown;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketLifecycle {
  state: TicketStatus;
  version?: number | null;
  available: AvailableTransition[];
  history: {
    transitions: LifecycleHistoryEntry[];
    effectRuns: LifecycleEffectRun[];
  };
}

export interface TicketComment {
  id: string;
  ticketId: string;
  authorId?: string | null;
  authorName?: string | null;
  kind: 'comment' | 'system' | 'resolution';
  body: string;
  createdAt: string;
}

export interface TicketAttachment {
  id: string;
  ticketId: string;
  fileId: string;
  uploadedById: string;
  createdAt: string;
  file: {
    id: string;
    filename: string;
    ext: string;
    mimeType: string;
    size: string | number;
  };
}

export interface TicketDetailData {
  ticket: TicketRow;
  lifecycle: TicketLifecycle;
  comments: TicketComment[];
  attachments: TicketAttachment[];
  permissions: Record<string, boolean>;
}

export interface EngineerWorkload {
  id: string;
  name?: string | null;
  email?: string | null;
  processing: number;
  resolved: number;
  closed: number;
  total: number;
}

export interface DashboardData {
  totals: {
    all: number;
    open: number;
    processing: number;
    resolved: number;
    closed: number;
    overdue: number;
  };
  byPriority: Record<string, number>;
  byCategory: Record<string, number>;
  recent: TicketRow[];
  workload: EngineerWorkload[];
  reminderHours: number;
}

export interface HelpdeskSettings {
  reminderHours: number;
  updatedAt?: string | null;
}

export interface WorkflowParameterField {
  type: string;
  title: string;
  bindings?: readonly { state?: string; transition?: string }[];
  description?: string;
}

export interface WorkflowDefinition {
  diagram: string;
  name: string;
  initial: string;
  initialStates: readonly string[];
  states: readonly {
    name: string;
    title: string;
    final: boolean;
  }[];
  stateInfo: readonly {
    name: string;
    title: string;
    final: boolean;
    meta: Readonly<Record<string, unknown>>;
  }[];
  transitions: readonly {
    name: string;
    title: string;
    from: readonly string[];
    to: readonly string[];
    effects: readonly string[];
    accept: readonly string[];
    manual: boolean;
    meta?: Readonly<Record<string, unknown>>;
  }[];
  triggers: readonly {
    name: string;
    transition: string;
    when: readonly string[];
  }[];
  parameterConfiguration?: {
    readMode: string;
    snapshotTransition?: string;
    groups: readonly {
      key: string;
      title: string;
      schemaVersion: number;
      fields: Readonly<Record<string, WorkflowParameterField>>;
    }[];
  };
}

export interface WorkflowExecutionRow {
  transition: LifecycleHistoryEntry;
  effectRuns: LifecycleEffectRun[];
  ticket: Ticket | null;
}

export interface WorkflowExecutionDetailData {
  transition: LifecycleHistoryEntry;
  effectRuns: LifecycleEffectRun[];
  ticket: Ticket | null;
  history: LifecycleHistoryEntry[];
}

export interface UserOption {
  id: string;
  name?: string | null;
  email?: string | null;
}
