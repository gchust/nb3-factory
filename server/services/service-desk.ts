import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { ServiceAccess } from './access.js';
import type { AutoAcceptGateway } from './automation.js';
import type { NotificationGateway } from './notification-gateway.js';
import type { ServerTranslator } from './translator.js';

export type { ServiceAccess } from './access.js';
export { SERVICE_ROLE } from './access.js';
export { ServiceDeskImplementation } from './service-desk-impl.js';

export interface CustomerInput {
  name: string;
  contactName?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
}

export interface DeviceInput {
  code: string;
  name: string;
  customerId: string;
  serviceEngineerId?: string | null;
  enabled?: boolean;
  nextInspectionAt?: string | Date | null;
  notes?: string | null;
}

export interface WorkOrderInput {
  title: string;
  customerId: string;
  deviceId: string;
  problem: string;
  priority?: string;
  dueAt?: string | Date | null;
  assigneeId?: string | null;
  confidential?: boolean;
}

export interface WorkOrderTransitionInput {
  action: 'accept' | 'start' | 'submit' | 'reject' | 'close';
  assigneeId?: string | null;
  note?: string | null;
  resolution?: string | null;
  rejectionReason?: string | null;
}

export interface AttachmentInput {
  fileId: string;
  category?: string;
}

export interface InspectionInput {
  deviceId: string;
  plannedDate: string;
  assigneeId?: string | null;
}

export interface KnowledgeInput {
  title: string;
  body: string;
  published?: boolean;
}

export interface ManualInput {
  title: string;
  filename?: string | null;
  content?: string | null;
  status?: string;
  failureReason?: string | null;
  // The internal AI Knowledge Base the manual was ingested into and the
  // document the manual's Markdown was uploaded as. The Manuals page records
  // these after it speaks to the Knowledge Base capability, so the linkage is
  // real data on the record rather than a display-only claim.
  knowledgeBaseKey?: string | null;
  documentId?: string | null;
}

export interface FaultInput {
  eventNo: string;
  customerId?: string | null;
  deviceCode?: string | null;
  title: string;
  problem: string;
  priority?: string;
  confidential?: boolean;
  payload?: unknown;
}

export interface ExternalActor {
  readonly id: string | null;
  readonly name: string;
  readonly role: string;
}

export interface ServiceDesk {
  listCustomers(access: ServiceAccess): Promise<unknown[]>;
  getCustomer(access: ServiceAccess, id: string): Promise<unknown>;
  createCustomer(access: ServiceAccess, input: CustomerInput): Promise<unknown>;
  updateCustomer(
    access: ServiceAccess,
    id: string,
    input: Partial<CustomerInput>,
  ): Promise<unknown>;
  deleteCustomer(access: ServiceAccess, id: string): Promise<void>;

  listDevices(access: ServiceAccess): Promise<unknown[]>;
  getDevice(access: ServiceAccess, id: string): Promise<unknown>;
  createDevice(access: ServiceAccess, input: DeviceInput): Promise<unknown>;
  updateDevice(
    access: ServiceAccess,
    id: string,
    input: Partial<DeviceInput>,
  ): Promise<unknown>;
  deleteDevice(access: ServiceAccess, id: string): Promise<void>;

  listWorkOrders(access: ServiceAccess): Promise<unknown[]>;
  getWorkOrder(access: ServiceAccess, id: string): Promise<unknown>;
  createWorkOrder(
    access: ServiceAccess,
    input: WorkOrderInput,
  ): Promise<unknown>;
  updateWorkOrder(
    access: ServiceAccess,
    id: string,
    input: Partial<WorkOrderInput>,
  ): Promise<unknown>;
  transitionWorkOrder(
    access: ServiceAccess,
    id: string,
    input: WorkOrderTransitionInput,
  ): Promise<unknown>;
  shareWorkOrder(
    access: ServiceAccess,
    id: string,
    engineerId: string,
  ): Promise<unknown>;
  revokeShare(
    access: ServiceAccess,
    id: string,
    shareId: string,
  ): Promise<void>;

  listAttachments(
    access: ServiceAccess,
    workOrderId: string,
  ): Promise<unknown[]>;
  linkAttachment(
    access: ServiceAccess,
    workOrderId: string,
    input: AttachmentInput,
  ): Promise<unknown>;
  unlinkAttachment(
    access: ServiceAccess,
    workOrderId: string,
    attachmentId: string,
  ): Promise<void>;
  getAttachmentFile(
    access: ServiceAccess,
    workOrderId: string,
    attachmentId: string,
  ): Promise<unknown>;

  listInspections(access: ServiceAccess): Promise<unknown[]>;
  createInspection(
    access: ServiceAccess,
    input: InspectionInput,
  ): Promise<unknown>;
  completeInspection(
    access: ServiceAccess,
    id: string,
    result: string,
  ): Promise<unknown>;

  listKnowledge(access: ServiceAccess): Promise<unknown[]>;
  createKnowledge(
    access: ServiceAccess,
    input: KnowledgeInput,
  ): Promise<unknown>;
  updateKnowledge(
    access: ServiceAccess,
    id: string,
    input: Partial<KnowledgeInput>,
  ): Promise<unknown>;
  deleteKnowledge(access: ServiceAccess, id: string): Promise<void>;

  listManuals(access: ServiceAccess): Promise<unknown[]>;
  createManual(access: ServiceAccess, input: ManualInput): Promise<unknown>;
  updateManual(
    access: ServiceAccess,
    id: string,
    input: Partial<ManualInput>,
  ): Promise<unknown>;
  deleteManual(access: ServiceAccess, id: string): Promise<void>;

  dashboard(access: ServiceAccess): Promise<Record<string, unknown>>;

  submitFault(input: FaultInput, actor: ExternalActor): Promise<unknown>;
  queryOrder(eventNo: string, actor: ExternalActor): Promise<unknown>;

  listAssignees(): Promise<unknown[]>;

  runOverdueReminders(locale: string | undefined): Promise<{ created: number }>;
  generateDueInspections(): Promise<{ created: number }>;
}

export const serviceDeskToken: ServiceToken<ServiceDesk> =
  createServiceToken<ServiceDesk>('app/service-desk');

export interface ServiceDeskDependencies {
  readonly database: DatabaseManager;
  readonly authz: AppAuthorization;
  readonly notifications: NotificationGateway;
  readonly automation?: AutoAcceptGateway;
  readonly translator?: ServerTranslator;
  readonly now?: () => Date;
  readonly newId?: () => string;
}

import { ServiceDeskImplementation } from './service-desk-impl.js';

export function createServiceDesk(
  dependencies: ServiceDeskDependencies,
): ServiceDesk {
  return new ServiceDeskImplementation(dependencies);
}
