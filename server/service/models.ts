/**
 * Row shapes of the application's own collections, as the database layer returns them.
 *
 * Only the columns application code reads or writes appear here. The migration remains the source of truth for the
 * physical schema; these interfaces exist so a repository query is checked against the fields the code actually uses.
 */

export interface ServiceEngineerGroupRow {
  id: number;
  code: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceEngineerProfileRow {
  id: number;
  userId: string;
  groupId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceCustomerRow {
  id: number;
  name: string;
  code: string | null;
  level: string | null;
  contact: string | null;
  phone: string | null;
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceEquipmentRow {
  id: number;
  code: string;
  name: string;
  model: string | null;
  serialNumber: string | null;
  location: string | null;
  status: string;
  customerId: number;
  engineerId: string | null;
  enabled: boolean;
  nextInspectionDate: Date | null;
  warrantyUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceWorkOrderRow {
  id: number;
  code: string | null;
  title: string;
  source: string;
  reporterId: string | null;
  customerId: number;
  equipmentId: number;
  description: string | null;
  priority: string;
  confidential: boolean;
  deadline: Date | null;
  assigneeId: string | null;
  supervisorId: string | null;
  status: string;
  acceptanceNote: string | null;
  resolutionNote: string | null;
  returnReason: string | null;
  acceptedAt: Date | null;
  startedAt: Date | null;
  submittedAt: Date | null;
  closedAt: Date | null;
  externalEventId: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceWorkOrderEventRow {
  id: number;
  workOrderId: number;
  type: string;
  status: string;
  message: string | null;
  detail: unknown;
  actorId: string | null;
  createdAt: Date;
}

export interface ServiceWorkOrderShareRow {
  id: number;
  workOrderId: number;
  engineerId: string;
  grantedById: string | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceInspectionRow {
  id: number;
  equipmentId: number;
  code: string | null;
  planDate: Date;
  dueDate: Date | null;
  assigneeId: string | null;
  status: string;
  result: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceRepairKnowledgeRow {
  id: number;
  title: string;
  category: string | null;
  tags: string | null;
  symptom: string | null;
  content: string | null;
  published: boolean;
  viewCount: number;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceManualRow {
  id: number;
  title: string;
  version: string;
  equipmentId: number;
  summary: string | null;
  content: string | null;
  driveKey: string | null;
  filename: string | null;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceExternalEventRow {
  id: number;
  externalEventId: string;
  source: string | null;
  eventType: string | null;
  status: string;
  message: string | null;
  workOrderId: number | null;
  payload: unknown;
  createdAt: Date;
}

export interface ServiceAttachmentRow {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number | string;
  workOrderId: number | null;
  createdAt: Date;
  updatedAt: Date;
}
