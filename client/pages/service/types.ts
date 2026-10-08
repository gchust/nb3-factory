export interface Customer {
  id: number;
  name: string;
  contactName: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: number;
  serial: string;
  name: string;
  model: string | null;
  customerId: number;
  engineerId: string | null;
  enabled: boolean;
  nextInspectionAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: number;
  ticketNo: string;
  title: string;
  customerId: number | null;
  deviceId: number | null;
  problem: string | null;
  priority: string;
  dueAt: string | null;
  ownerId: string | null;
  confidential: boolean;
  status: string;
  result: string | null;
  resolutionNote: string | null;
  rejectReason: string | null;
  acceptedAt: string | null;
  closedAt: string | null;
  externalEventNo: string | null;
  source: string;
  createdById: string | null;
  observerVisible: boolean;
  assistantDraft: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetail {
  ticket: Ticket;
  logs: AcceptanceLog[];
  shares: TicketShare[];
  attachments: Attachment[];
  /** `full` for the owner, creator, a supervisor or a shared engineer;
   * `summary` for a read-only observer, whose internal sections stay empty. */
  access: 'full' | 'summary';
}

export interface AcceptanceLog {
  id: number;
  ticketId: number;
  step: string;
  status: string;
  message: string | null;
  retryable: boolean;
  eventKey: string | null;
  createdAt: string;
}

export interface TicketShare {
  id: number;
  ticketId: number;
  engineerId: string;
  grantedById: string | null;
  active: boolean;
  createdAt: string;
}

export interface Attachment {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  ticketId: number | null;
  category: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Inspection {
  id: number;
  deviceId: number;
  plannedDate: string;
  ownerId: string;
  status: string;
  result: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeArticle {
  id: number;
  title: string;
  summary: string | null;
  body: string;
  published: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Manual {
  id: number;
  title: string;
  model: string;
  summary: string | null;
  body: string;
  status: string;
  statusMessage: string | null;
  knowledgeBaseKey: string | null;
  fileId: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceMessage {
  id: number;
  recipientId: string;
  kind: string;
  title: string;
  body: string | null;
  route: string | null;
  ticketId: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface EngineerWorkload {
  engineerId: string;
  name: string;
  total: number;
  open: number;
}

export interface DashboardSummary {
  byStatus: Record<string, number>;
  overdue: number;
  urgentOpen: number;
  myOpen: number;
  pendingInspectionsToday: number;
  acceptanceFailures: number;
  unreadMessages: number;
  total: number;
  byEngineer: EngineerWorkload[];
}

export interface IntegrationApiKey {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  expiresAt: string | null;
  createdAt: string;
  ownerId: string;
  ownerName: string;
}

export interface EngineerOption {
  id: string;
  name: string;
  permissionSet: string;
}

export interface IntegrationStatus {
  authorization: boolean;
  workflow: boolean;
  scheduler: boolean;
  notification: boolean;
  knowledgeBase: boolean;
  llmService: boolean;
  vectorDatabase: boolean;
  embeddingModel: boolean;
  missing: string[];
}

export interface AssistantCitation {
  type: 'ticket' | 'knowledge' | 'manual';
  id: number;
  title: string;
  snippet: string;
  route: string;
  score: number;
}

export interface AssistantTurn {
  id: number;
  role: string;
  content: string;
  citations: AssistantCitation[];
}

export interface AssistantAnswer {
  mode: string;
  generated: boolean;
  answer: string;
  resolutionNoteDraft: string;
  citations: AssistantCitation[];
  notes: string[];
  turns: AssistantTurn[];
}

export interface AssistantStatus {
  groundedRetrieval: boolean;
  generativeAnswer: boolean;
  llmService: boolean;
  vectorDatabase: boolean;
  embeddingModel: boolean;
  knowledgeBase: boolean;
  missing: string[];
  mode: string;
}
