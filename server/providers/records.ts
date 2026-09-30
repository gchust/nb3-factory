/**
 * Read shapes for the service Collections.
 *
 * The Repository defaults every row to `RepositoryRecord`, whose values are a
 * union that includes objects and arrays. Passing one of these interfaces as the
 * Repository's record type narrows each column to the scalar the migration
 * declares, which is what lets a provider build a message from a row without
 * guarding every field first. They are intersections with `Record<string,
 * unknown>` so a typed row is still accepted where a plain row is expected.
 */

export type ServiceCustomerRecord = Record<string, unknown> & {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly address: string | null;
  readonly serviceLevel: string;
  readonly notes: string | null;
  readonly ownerId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;
};

export type ServiceDeviceRecord = Record<string, unknown> & {
  readonly id: number;
  readonly serialNumber: string;
  readonly name: string;
  readonly model: string | null;
  readonly category: string | null;
  readonly location: string | null;
  readonly status: string;
  readonly warrantyUntil: string | null;
  readonly notes: string | null;
  readonly customerId: number;
  readonly createdAt: string;
  readonly updatedAt: string | null;
};

export type ServiceTicketRecord = Record<string, unknown> & {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: string;
  readonly priority: string;
  readonly source: string | null;
  readonly confidential: boolean;
  readonly reporterName: string | null;
  readonly resolution: string | null;
  readonly acceptedAt: string | null;
  readonly startedAt: string | null;
  readonly submittedAt: string | null;
  readonly closedAt: string | null;
  readonly dueAt: string | null;
  readonly acceptanceStatus: string | null;
  readonly acceptanceError: string | null;
  readonly acceptanceHandledAt: string | null;
  readonly externalEventId: string | null;
  readonly externalPlatform: string | null;
  readonly createdById: string | null;
  readonly assigneeId: string | null;
  readonly customerId: number;
  readonly deviceId: number;
  readonly createdAt: string;
  readonly updatedAt: string | null;
};

export type ServiceTicketEventRecord = Record<string, unknown> & {
  readonly id: number;
  readonly type: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly message: string | null;
  readonly actorId: string | null;
  readonly data: Record<string, unknown> | null;
  readonly ticketId: number;
  readonly createdAt: string;
};

export type ServiceTicketOperationRecord = Record<string, unknown> & {
  readonly id: number;
  readonly idempotencyKey: string;
  readonly type: string;
  readonly status: string;
  readonly error: string | null;
  readonly result: Record<string, unknown> | null;
  readonly ticketId: number;
  readonly createdAt: string;
  readonly updatedAt: string | null;
};

export type ServiceAttachmentRecord = Record<string, unknown> & {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string | null;
  readonly mimeType: string;
  readonly size: number;
  readonly category: string;
  readonly ticketId: number | null;
  readonly manualId: number | null;
  readonly uploadedById: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;
};

export type ServiceInspectionRecord = Record<string, unknown> & {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly scheduledDate: string;
  readonly status: string;
  readonly result: string | null;
  readonly findings: string | null;
  readonly completedAt: string | null;
  readonly remindedAt: string | null;
  readonly createdById: string | null;
  readonly assigneeId: string | null;
  readonly customerId: number;
  readonly deviceId: number;
  readonly createdAt: string;
  readonly updatedAt: string | null;
};

export type ServiceKnowledgeArticleRecord = Record<string, unknown> & {
  readonly id: number;
  readonly title: string;
  readonly slug: string;
  readonly category: string;
  readonly deviceCategory: string | null;
  readonly summary: string | null;
  readonly content: string | null;
  readonly status: string;
  readonly viewCount: number;
  readonly authorId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;
};

export type ServiceManualRecord = Record<string, unknown> & {
  readonly id: number;
  readonly title: string;
  readonly code: string;
  readonly deviceCategory: string | null;
  readonly model: string | null;
  readonly version: string | null;
  readonly summary: string | null;
  readonly content: string | null;
  readonly status: string;
  readonly knowledgeBaseKey: string | null;
  readonly indexStatus: string | null;
  readonly indexError: string | null;
  readonly viewCount: number;
  readonly createdAt: string;
  readonly updatedAt: string | null;
};

export type ServiceTeamRecord = Record<string, unknown> & {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;
};
