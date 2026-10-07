import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  databaseManagerToken,
  type DatabaseManager,
  type DatabaseConnection,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

import { retrieve, type RetrievalResult } from './document-retrieval.js';

/** Service token other providers and routes resolve the Document Center through. */
export const documentCenterServiceToken =
  createServiceToken<DocumentCenterService>(
    '@nocobase/nb3-factory/document-center',
  );

/** The settings item id the admin console and the admin API are protected by. */
export const DOCUMENT_CENTER_SETTINGS_ID = 'documentCenter';
/** The application namespace the settings item's title and action are translated in. */
export const DOCUMENT_CENTER_NAMESPACE = 'nb3-factory';

/** Every failure the service reports, mapped to an HTTP status by the routes. */
export type DocumentCenterErrorCode =
  | 'DOCUMENT_NOT_FOUND'
  | 'DOCUMENT_ACCESS_DENIED'
  | 'DOCUMENT_VERSION_CONFLICT'
  | 'DOCUMENT_CODE_TAKEN'
  | 'DOCUMENT_DEPARTMENTS_REQUIRED'
  | 'DEPARTMENT_NOT_FOUND'
  | 'DEPARTMENT_CODE_TAKEN'
  | 'DEPARTMENT_MEMBER_NOT_FOUND'
  | 'DEPARTMENT_MEMBER_EXISTS'
  | 'BACKUP_NOT_FOUND'
  | 'RESTORE_CONFIRMATION_REQUIRED';

/**
 * A domain failure. It carries no HTTP status or body: the routes translate the
 * code, which keeps the service usable outside a request.
 */
export class DocumentCenterError extends Error {
  public constructor(
    public readonly code: DocumentCenterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DocumentCenterError';
  }
}

export interface DepartmentRecord {
  id: number;
  code: string;
  title: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DepartmentMemberRecord {
  id: number;
  departmentId: number;
  userId: string;
  primary: boolean;
  createdAt: Date;
}

export interface DocumentRecord {
  id: number;
  code: string | null;
  title: string;
  category: string;
  summary: string | null;
  content: string;
  status: string;
  visibility: string;
  version: number;
  createdById: string | null;
  updatedById: string | null;
  deletedAt: Date | null;
  deletedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentVersionRecord {
  id: number;
  documentId: number;
  version: number;
  title: string;
  category: string;
  summary: string | null;
  content: string;
  visibility: string;
  departmentIds: unknown;
  changeNote: string | null;
  createdById: string | null;
  createdAt: Date;
}

export interface DocumentDepartmentRecord {
  id: number;
  documentId: number;
  departmentId: number;
  createdAt: Date;
}

export interface DocumentBackupRecord {
  id: number;
  title: string;
  documentCount: number;
  versionCount: number;
  snapshot: unknown;
  createdById: string | null;
  createdAt: Date;
}

export interface DocumentQuestionRecord {
  id: number;
  userId: string | null;
  question: string;
  matched: boolean;
  citationCount: number;
  citations: unknown;
  createdAt: Date;
}

export interface DocumentSummary {
  readonly id: number;
  readonly code: string | null;
  readonly title: string;
  readonly category: string;
  readonly summary: string | null;
  readonly status: string;
  readonly visibility: string;
  readonly version: number;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly departmentIds: readonly number[];
}

export interface DocumentDetail extends DocumentSummary {
  readonly content: string;
  readonly createdById: string | null;
  readonly updatedById: string | null;
  readonly deletedById: string | null;
}

export interface DocumentVersionView {
  readonly id: number;
  readonly documentId: number;
  readonly version: number;
  readonly title: string;
  readonly category: string;
  readonly summary: string | null;
  readonly content: string;
  readonly visibility: string;
  readonly departmentIds: readonly number[];
  readonly changeNote: string | null;
  readonly createdById: string | null;
  readonly createdByName: string | null;
  readonly createdAt: Date;
}

export interface DepartmentMemberView {
  readonly id: number;
  readonly departmentId: number;
  readonly userId: string;
  readonly primary: boolean;
  readonly createdAt: Date;
}

export interface DirectoryUser {
  readonly id: string;
  readonly name: string | null;
  readonly username: string | null;
  readonly email: string | null;
}

export interface ListDocumentsQuery {
  readonly actorId: string;
  readonly actorCanManage: boolean;
  readonly search?: string;
  readonly category?: string;
  readonly deleted?: 'exclude' | 'include' | 'only';
  readonly page: number;
  readonly pageSize: number;
}

export interface DocumentListPage {
  readonly items: readonly DocumentSummary[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface CreateDocumentInput {
  readonly title: string;
  readonly code?: string | null;
  readonly category: string;
  readonly summary?: string | null;
  readonly content: string;
  readonly status?: string;
  readonly visibility: string;
  readonly departmentIds?: readonly number[];
  readonly changeNote?: string | null;
}

export interface UpdateDocumentInput {
  readonly title?: string;
  readonly code?: string | null;
  readonly category?: string;
  readonly summary?: string | null;
  readonly content?: string;
  readonly status?: string;
  readonly visibility?: string;
  readonly departmentIds?: readonly number[];
  readonly changeNote?: string | null;
  readonly expectedVersion?: number;
}

export interface RestoreVersionInput {
  readonly actorId: string;
  readonly documentId: number;
  readonly version: number;
  readonly changeNote?: string | null;
}

export interface CreateDepartmentInput {
  readonly code: string;
  readonly title: string;
  readonly description?: string | null;
  readonly sortOrder?: number;
  readonly active?: boolean;
}

export interface UpdateDepartmentInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly sortOrder?: number;
  readonly active?: boolean;
}

export interface BackupDocumentSnapshot {
  readonly id: number;
  readonly code: string | null;
  readonly title: string;
  readonly category: string;
  readonly summary: string | null;
  readonly content: string;
  readonly status: string;
  readonly visibility: string;
  readonly version: number;
  readonly createdById: string | null;
  readonly updatedById: string | null;
  readonly deletedAt: string | null;
  readonly deletedById: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly departmentIds: readonly number[];
}

export interface BackupVersionSnapshot {
  readonly documentId: number;
  readonly version: number;
  readonly title: string;
  readonly category: string;
  readonly summary: string | null;
  readonly content: string;
  readonly visibility: string;
  readonly departmentIds: readonly number[];
  readonly changeNote: string | null;
  readonly createdById: string | null;
  readonly createdAt: string;
}

export interface BackupDepartmentSnapshot {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly active: boolean;
}

export interface DocumentBackupSnapshot {
  readonly schemaVersion: 1;
  readonly createdAt: string;
  readonly departments: readonly BackupDepartmentSnapshot[];
  readonly documents: readonly BackupDocumentSnapshot[];
  readonly versions: readonly BackupVersionSnapshot[];
}

export interface BackupView {
  readonly id: number;
  readonly title: string;
  readonly documentCount: number;
  readonly versionCount: number;
  readonly createdById: string | null;
  readonly createdAt: Date;
}

export type BackupImpactAction =
  'create' | 'update' | 'restore' | 'delete' | 'unchanged';

export interface BackupImpactEntry {
  readonly documentId: number | null;
  readonly title: string;
  readonly code: string | null;
  readonly action: BackupImpactAction;
}

export interface BackupImpact {
  readonly backup: BackupView;
  readonly summary: {
    readonly create: number;
    readonly update: number;
    readonly restore: number;
    readonly delete: number;
    readonly unchanged: number;
    readonly total: number;
  };
  readonly documents: readonly BackupImpactEntry[];
}

export interface AskInput {
  readonly actorId: string;
  readonly question: string;
}

function now(): Date {
  return new Date();
}

function toDate(value: unknown, fallback?: Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback ?? now();
}

function toNullableDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeNumberArray(value: unknown): number[] {
  let source: unknown = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(source)) return [];
  return source
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
}

function parseSnapshot(value: unknown): DocumentBackupSnapshot {
  const source =
    typeof value === 'string'
      ? (JSON.parse(value) as DocumentBackupSnapshot)
      : (value as DocumentBackupSnapshot);
  return source;
}

function matchesSearch(
  search: string,
  ...fields: readonly (string | null)[]
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => (field ?? '').toLowerCase().includes(needle));
}

function setOf(values: readonly number[]): string {
  return [...new Set(values)].sort((left, right) => left - right).join(',');
}

/**
 * The Document Center: department-based visibility over append-only document
 * versions, plus the backup and restore of the whole center.
 *
 * It reads and writes through Repository and resolves every access decision in
 * this process. The routes own HTTP; this owns the business rules.
 */
export class DocumentCenterService {
  public constructor(private readonly database: DatabaseManager) {}

  private connection(): DatabaseConnection {
    return this.database.connection();
  }

  private repo<TRecord extends object = Record<string, unknown>>(
    collection: string,
  ) {
    return this.connection().repository<TRecord>(collection);
  }

  private async allDepartments(): Promise<DepartmentRecord[]> {
    return this.repo<DepartmentRecord>('departments').findMany();
  }

  private async departmentLinks(): Promise<DocumentDepartmentRecord[]> {
    return this.repo<DocumentDepartmentRecord>(
      'documentDepartments',
    ).findMany();
  }

  private linksByDocument(
    links: readonly DocumentDepartmentRecord[],
  ): Map<number, number[]> {
    const map = new Map<number, number[]>();
    for (const link of links) {
      const list = map.get(link.documentId) ?? [];
      list.push(link.departmentId);
      map.set(link.documentId, list);
    }
    return map;
  }

  private async membershipsFor(
    userId: string,
  ): Promise<DepartmentMemberRecord[]> {
    return this.repo<DepartmentMemberRecord>('departmentMembers').findMany({
      filter: { userId },
    });
  }

  /**
   * The documents an employee may read: published, not deleted, and either
   * visible to everyone or to one of the departments they belong to.
   */
  private async visibleDocuments(actorId: string): Promise<{
    documents: DocumentRecord[];
    links: Map<number, number[]>;
  }> {
    const [documents, links, memberships] = await Promise.all([
      this.repo<DocumentRecord>('documents').findMany(),
      this.departmentLinks(),
      this.membershipsFor(actorId),
    ]);
    const mine = new Set(memberships.map((member) => member.departmentId));
    const byDocument = this.linksByDocument(links);
    const visible = documents.filter((document) => {
      if (document.status !== 'published' || document.deletedAt) return false;
      if (document.visibility === 'all') return true;
      return (byDocument.get(document.id) ?? []).some((id) => mine.has(id));
    });
    return { documents: visible, links: byDocument };
  }

  private summary(
    document: DocumentRecord,
    departmentIds: readonly number[],
  ): DocumentSummary {
    return {
      id: document.id,
      code: document.code,
      title: document.title,
      category: document.category,
      summary: document.summary,
      status: document.status,
      visibility: document.visibility,
      version: document.version,
      deletedAt: document.deletedAt,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      departmentIds,
    };
  }

  private detail(
    document: DocumentRecord,
    departmentIds: readonly number[],
  ): DocumentDetail {
    return {
      ...this.summary(document, departmentIds),
      content: document.content,
      createdById: document.createdById,
      updatedById: document.updatedById,
      deletedById: document.deletedById,
    };
  }

  private versionView(
    version: DocumentVersionRecord,
    createdByName: string | null,
  ): DocumentVersionView {
    return {
      id: version.id,
      documentId: version.documentId,
      version: version.version,
      title: version.title,
      category: version.category,
      summary: version.summary,
      content: version.content,
      visibility: version.visibility,
      departmentIds: normalizeNumberArray(version.departmentIds),
      changeNote: version.changeNote,
      createdById: version.createdById,
      createdByName,
      createdAt: version.createdAt,
    };
  }

  private async requireDocument(documentId: number): Promise<DocumentRecord> {
    const document = await this.repo<DocumentRecord>('documents').findOne({
      filter: { id: documentId },
    });
    if (!document) {
      throw new DocumentCenterError(
        'DOCUMENT_NOT_FOUND',
        `Document ${documentId} was not found.`,
      );
    }
    return document;
  }

  private async requireDepartment(
    departmentId: number,
  ): Promise<DepartmentRecord> {
    const department = await this.repo<DepartmentRecord>('departments').findOne(
      {
        filter: { id: departmentId },
      },
    );
    if (!department) {
      throw new DocumentCenterError(
        'DEPARTMENT_NOT_FOUND',
        `Department ${departmentId} was not found.`,
      );
    }
    return department;
  }

  private async requireDepartments(
    departmentIds: readonly number[],
  ): Promise<number[]> {
    const unique = [...new Set(departmentIds)];
    const departments = await this.allDepartments();
    const known = new Set(departments.map((department) => department.id));
    for (const id of unique) {
      if (!known.has(id)) {
        throw new DocumentCenterError(
          'DEPARTMENT_NOT_FOUND',
          `Department ${id} was not found.`,
        );
      }
    }
    return unique;
  }

  private async replaceDocumentDepartments(
    documentId: number,
    departmentIds: readonly number[],
  ): Promise<void> {
    const repo = this.repo<DocumentDepartmentRecord>('documentDepartments');
    await repo.deleteMany({ filter: { documentId } });
    const createdAt = now();
    for (const departmentId of departmentIds) {
      await repo.createOne({
        values: { documentId, departmentId, createdAt },
      });
    }
  }

  /** The documents a caller may list, unified for employees and administrators. */
  public async listDocuments(
    query: ListDocumentsQuery,
  ): Promise<DocumentListPage> {
    const links = this.linksByDocument(await this.departmentLinks());
    const documents = query.actorCanManage
      ? await this.repo<DocumentRecord>('documents').findMany()
      : (await this.visibleDocuments(query.actorId)).documents;
    const deleted = query.actorCanManage
      ? (query.deleted ?? 'exclude')
      : 'exclude';

    const filtered = documents.filter((document) => {
      if (deleted === 'exclude' && document.deletedAt) return false;
      if (deleted === 'only' && !document.deletedAt) return false;
      if (query.category && document.category !== query.category) return false;
      return matchesSearch(
        query.search ?? '',
        document.title,
        document.summary,
        document.code,
      );
    });

    filtered.sort(
      (left, right) =>
        toDate(right.updatedAt).getTime() - toDate(left.updatedAt).getTime() ||
        right.id - left.id,
    );
    const start = (query.page - 1) * query.pageSize;
    return {
      items: filtered
        .slice(start, start + query.pageSize)
        .map((document) =>
          this.summary(document, links.get(document.id) ?? []),
        ),
      total: filtered.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  public async getDocument(input: {
    readonly actorId: string;
    readonly actorCanManage: boolean;
    readonly documentId: number;
  }): Promise<DocumentDetail> {
    if (input.actorCanManage) {
      const document = await this.requireDocument(input.documentId);
      const links = this.linksByDocument(await this.departmentLinks());
      return this.detail(document, links.get(document.id) ?? []);
    }
    const { documents, links } = await this.visibleDocuments(input.actorId);
    const document = documents.find((entry) => entry.id === input.documentId);
    if (!document) {
      throw new DocumentCenterError(
        'DOCUMENT_ACCESS_DENIED',
        'You are not allowed to view this document.',
      );
    }
    return this.detail(document, links.get(document.id) ?? []);
  }

  public async listVersions(input: {
    readonly actorId: string;
    readonly actorCanManage: boolean;
    readonly documentId: number;
  }): Promise<readonly DocumentVersionView[]> {
    await this.getDocument(input);
    const versions = await this.repo<DocumentVersionRecord>(
      'documentVersions',
    ).findMany({
      filter: { documentId: input.documentId },
    });
    // The modifier is part of what a version history has to show, so the name
    // is resolved on the server for every reader rather than through the
    // administrator-only directory endpoint. Only the accounts that authored
    // this document's versions are revealed.
    const names = await this.userDisplayNames(
      versions.map((version) => version.createdById),
    );
    return versions
      .map((version) =>
        this.versionView(version, names.get(version.createdById ?? '') ?? null),
      )
      .sort((left, right) => right.version - left.version);
  }

  /**
   * Answer a question from the documents the asker may read. The retrieval
   * only ever sees those documents, so a citation of something the asker may
   * not view is impossible rather than filtered afterwards.
   */
  public async ask(input: AskInput): Promise<RetrievalResult> {
    const { documents } = await this.visibleDocuments(input.actorId);
    const result = retrieve(
      input.question,
      documents.map((document) => ({
        id: String(document.id),
        title: document.title,
        version: document.version,
        content: document.content,
      })),
    );
    await this.repo<DocumentQuestionRecord>('documentQuestions').createOne({
      values: {
        userId: input.actorId,
        question: input.question,
        matched: result.hasAnswer,
        citationCount: result.citations.length,
        citations: result.citations,
        createdAt: now(),
      },
    });
    return result;
  }

  private async appendVersion(
    document: DocumentRecord,
    departmentIds: readonly number[],
    values: {
      readonly title: string;
      readonly category: string;
      readonly summary: string | null;
      readonly content: string;
      readonly visibility: string;
      readonly changeNote: string | null;
      readonly createdById: string | null;
    },
    nextVersion: number,
  ): Promise<void> {
    await this.repo<DocumentVersionRecord>('documentVersions').createOne({
      values: {
        documentId: document.id,
        version: nextVersion,
        title: values.title,
        category: values.category,
        summary: values.summary,
        content: values.content,
        visibility: values.visibility,
        departmentIds,
        changeNote: values.changeNote,
        createdById: values.createdById,
        createdAt: now(),
      },
    });
  }

  private async ensureCodeAvailable(
    code: string | null | undefined,
    exceptId?: number,
  ): Promise<void> {
    if (!code) return;
    const existing = await this.repo<DocumentRecord>('documents').findOne({
      filter: { code },
    });
    if (existing && existing.id !== exceptId) {
      throw new DocumentCenterError(
        'DOCUMENT_CODE_TAKEN',
        `A document with code ${code} already exists.`,
      );
    }
  }

  public async createDocument(input: {
    readonly actorId: string;
    readonly values: CreateDocumentInput;
  }): Promise<DocumentDetail> {
    const values = input.values;
    await this.ensureCodeAvailable(values.code);
    const departmentIds = await this.requireDepartments(
      values.departmentIds ?? [],
    );
    if (values.visibility === 'departments' && departmentIds.length === 0) {
      throw new DocumentCenterError(
        'DOCUMENT_DEPARTMENTS_REQUIRED',
        'A department-restricted document needs at least one department.',
      );
    }
    const timestamp = now();
    const created = await this.repo<DocumentRecord>('documents').createOne({
      values: {
        code: values.code ?? null,
        title: values.title,
        category: values.category,
        summary: values.summary ?? null,
        content: values.content,
        status: values.status ?? 'draft',
        visibility: values.visibility,
        version: 1,
        createdById: input.actorId,
        updatedById: input.actorId,
        deletedAt: null,
        deletedById: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    const document = created.record;
    await this.replaceDocumentDepartments(document.id, departmentIds);
    await this.appendVersion(
      document,
      departmentIds,
      {
        title: document.title,
        category: document.category,
        summary: document.summary,
        content: document.content,
        visibility: document.visibility,
        changeNote: values.changeNote ?? null,
        createdById: input.actorId,
      },
      1,
    );
    return this.detail(document, departmentIds);
  }

  public async updateDocument(input: {
    readonly actorId: string;
    readonly documentId: number;
    readonly values: UpdateDocumentInput;
  }): Promise<DocumentDetail> {
    const document = await this.requireDocument(input.documentId);
    const values = input.values;
    if (
      values.expectedVersion !== undefined &&
      values.expectedVersion !== document.version
    ) {
      throw new DocumentCenterError(
        'DOCUMENT_VERSION_CONFLICT',
        `Document ${document.id} is at version ${document.version}, not ${values.expectedVersion}.`,
      );
    }
    if (values.code !== undefined) {
      await this.ensureCodeAvailable(values.code, document.id);
    }

    const visibility = values.visibility ?? document.visibility;
    const existingLinks = this.linksByDocument(await this.departmentLinks());
    let departmentIds =
      values.departmentIds ?? existingLinks.get(document.id) ?? [];
    if (values.departmentIds !== undefined) {
      departmentIds = await this.requireDepartments(values.departmentIds);
    }
    if (visibility === 'departments' && departmentIds.length === 0) {
      throw new DocumentCenterError(
        'DOCUMENT_DEPARTMENTS_REQUIRED',
        'A department-restricted document needs at least one department.',
      );
    }

    const nextVersion = document.version + 1;
    const updated = await this.repo<DocumentRecord>('documents').updateOne({
      filter: { id: document.id },
      values: {
        code: values.code === undefined ? document.code : values.code,
        title: values.title ?? document.title,
        category: values.category ?? document.category,
        summary:
          values.summary === undefined ? document.summary : values.summary,
        content: values.content ?? document.content,
        status: values.status ?? document.status,
        visibility,
        version: nextVersion,
        updatedById: input.actorId,
        updatedAt: now(),
      },
    });
    const record = updated.record;
    if (values.departmentIds !== undefined) {
      await this.replaceDocumentDepartments(record.id, departmentIds);
    }
    await this.appendVersion(
      record,
      departmentIds,
      {
        title: record.title,
        category: record.category,
        summary: record.summary,
        content: record.content,
        visibility: record.visibility,
        changeNote: values.changeNote ?? null,
        createdById: input.actorId,
      },
      nextVersion,
    );
    return this.detail(record, departmentIds);
  }

  public async deleteDocument(input: {
    readonly actorId: string;
    readonly documentId: number;
  }): Promise<DocumentSummary> {
    const document = await this.requireDocument(input.documentId);
    const links = this.linksByDocument(await this.departmentLinks());
    const updated = await this.repo<DocumentRecord>('documents').updateOne({
      filter: { id: document.id },
      values: {
        deletedAt: now(),
        deletedById: input.actorId,
        updatedAt: now(),
      },
    });
    return this.summary(updated.record, links.get(document.id) ?? []);
  }

  public async restoreDocument(input: {
    readonly documentId: number;
  }): Promise<DocumentSummary> {
    const document = await this.requireDocument(input.documentId);
    const links = this.linksByDocument(await this.departmentLinks());
    const updated = await this.repo<DocumentRecord>('documents').updateOne({
      filter: { id: document.id },
      values: { deletedAt: null, deletedById: null, updatedAt: now() },
    });
    return this.summary(updated.record, links.get(document.id) ?? []);
  }

  public async restoreVersion(
    input: RestoreVersionInput,
  ): Promise<DocumentDetail> {
    const document = await this.requireDocument(input.documentId);
    const version = await this.repo<DocumentVersionRecord>(
      'documentVersions',
    ).findOne({
      filter: { documentId: document.id, version: input.version },
    });
    if (!version) {
      throw new DocumentCenterError(
        'DOCUMENT_NOT_FOUND',
        `Version ${input.version} of document ${document.id} was not found.`,
      );
    }
    const departmentIds = await this.requireDepartments(
      normalizeNumberArray(version.departmentIds),
    );
    const nextVersion = document.version + 1;
    const updated = await this.repo<DocumentRecord>('documents').updateOne({
      filter: { id: document.id },
      values: {
        title: version.title,
        category: version.category,
        summary: version.summary,
        content: version.content,
        visibility: version.visibility,
        version: nextVersion,
        updatedById: input.actorId,
        updatedAt: now(),
      },
    });
    await this.replaceDocumentDepartments(document.id, departmentIds);
    await this.appendVersion(
      updated.record,
      departmentIds,
      {
        title: version.title,
        category: version.category,
        summary: version.summary,
        content: version.content,
        visibility: version.visibility,
        changeNote: input.changeNote ?? null,
        createdById: input.actorId,
      },
      nextVersion,
    );
    return this.detail(updated.record, departmentIds);
  }

  public async listDepartments(): Promise<readonly DepartmentRecord[]> {
    const departments = await this.allDepartments();
    return departments.sort(
      (left, right) => left.sortOrder - right.sortOrder || left.id - right.id,
    );
  }

  public async createDepartment(input: {
    readonly values: CreateDepartmentInput;
  }): Promise<DepartmentRecord> {
    const existing = await this.repo<DepartmentRecord>('departments').findOne({
      filter: { code: input.values.code },
    });
    if (existing) {
      throw new DocumentCenterError(
        'DEPARTMENT_CODE_TAKEN',
        `A department with code ${input.values.code} already exists.`,
      );
    }
    const timestamp = now();
    const created = await this.repo<DepartmentRecord>('departments').createOne({
      values: {
        code: input.values.code,
        title: input.values.title,
        description: input.values.description ?? null,
        sortOrder: input.values.sortOrder ?? 0,
        active: input.values.active ?? true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    return created.record;
  }

  public async updateDepartment(input: {
    readonly departmentId: number;
    readonly values: UpdateDepartmentInput;
  }): Promise<DepartmentRecord> {
    const department = await this.requireDepartment(input.departmentId);
    const updated = await this.repo<DepartmentRecord>('departments').updateOne({
      filter: { id: department.id },
      values: {
        title: input.values.title ?? department.title,
        description:
          input.values.description === undefined
            ? department.description
            : input.values.description,
        sortOrder: input.values.sortOrder ?? department.sortOrder,
        active: input.values.active ?? department.active,
        updatedAt: now(),
      },
    });
    return updated.record;
  }

  public async listMembers(
    departmentId: number,
  ): Promise<readonly DepartmentMemberView[]> {
    await this.requireDepartment(departmentId);
    const members = await this.repo<DepartmentMemberRecord>(
      'departmentMembers',
    ).findMany({ filter: { departmentId } });
    return members.sort((left, right) => left.id - right.id);
  }

  public async addMember(input: {
    readonly departmentId: number;
    readonly userId: string;
    readonly primary?: boolean;
  }): Promise<DepartmentMemberView> {
    await this.requireDepartment(input.departmentId);
    const existing = await this.repo<DepartmentMemberRecord>(
      'departmentMembers',
    ).findOne({
      filter: { departmentId: input.departmentId, userId: input.userId },
    });
    if (existing) {
      throw new DocumentCenterError(
        'DEPARTMENT_MEMBER_EXISTS',
        'This user already belongs to the department.',
      );
    }
    const created = await this.repo<DepartmentMemberRecord>(
      'departmentMembers',
    ).createOne({
      values: {
        departmentId: input.departmentId,
        userId: input.userId,
        primary: input.primary ?? false,
        createdAt: now(),
      },
    });
    return created.record;
  }

  public async removeMember(memberId: number): Promise<void> {
    const member = await this.repo<DepartmentMemberRecord>(
      'departmentMembers',
    ).findOne({ filter: { id: memberId } });
    if (!member) {
      throw new DocumentCenterError(
        'DEPARTMENT_MEMBER_NOT_FOUND',
        `Membership ${memberId} was not found.`,
      );
    }
    await this.repo('departmentMembers').deleteMany({
      filter: { id: memberId },
    });
  }

  /** Accounts an administrator can add to a department, read from the authentication user table. */
  public async listDirectoryUsers(input: {
    readonly search?: string;
    readonly limit?: number;
  }): Promise<readonly DirectoryUser[]> {
    const users = await this.repo<{
      id: string;
      name: string | null;
      username: string | null;
      email: string | null;
      disabledAt: Date | null;
      deletedAt: Date | null;
    }>('user').findMany();
    return users
      .filter((user) => !user.deletedAt && !user.disabledAt)
      .filter((user) =>
        matchesSearch(input.search ?? '', user.name, user.username, user.email),
      )
      .slice(0, input.limit ?? 50)
      .map((user) => ({
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
      }));
  }

  /**
   * The display names of the accounts with the given ids, read from the
   * authentication user table. Used to show a version's modifier without
   * exposing the whole directory to a reader who may not manage the center.
   */
  private async userDisplayNames(
    ids: readonly (string | null)[],
  ): Promise<Map<string, string>> {
    const wanted = new Set<string>();
    for (const id of ids) {
      if (id) wanted.add(id);
    }
    const names = new Map<string, string>();
    if (wanted.size === 0) return names;
    // An application assembled without the users collection has no names to
    // show, but the version history still renders.
    if (!(await this.connection().builder.hasCollection('user'))) {
      return names;
    }
    const users = await this.repo<{
      id: string;
      name: string | null;
      username: string | null;
      email: string | null;
    }>('user').findMany();
    for (const user of users) {
      if (!wanted.has(user.id)) continue;
      const name = user.name ?? user.username ?? user.email ?? null;
      if (name) names.set(user.id, name);
    }
    return names;
  }

  private async buildSnapshot(): Promise<DocumentBackupSnapshot> {
    const [departments, documents, versions, links] = await Promise.all([
      this.allDepartments(),
      this.repo<DocumentRecord>('documents').findMany(),
      this.repo<DocumentVersionRecord>('documentVersions').findMany(),
      this.departmentLinks(),
    ]);
    const byDocument = this.linksByDocument(links);
    return {
      schemaVersion: 1,
      createdAt: now().toISOString(),
      departments: departments.map((department) => ({
        id: department.id,
        code: department.code,
        title: department.title,
        description: department.description,
        sortOrder: department.sortOrder,
        active: department.active,
      })),
      documents: documents.map((document) => ({
        id: document.id,
        code: document.code,
        title: document.title,
        category: document.category,
        summary: document.summary,
        content: document.content,
        status: document.status,
        visibility: document.visibility,
        version: document.version,
        createdById: document.createdById,
        updatedById: document.updatedById,
        deletedAt: toNullableDate(document.deletedAt)?.toISOString() ?? null,
        deletedById: document.deletedById,
        createdAt: toDate(document.createdAt).toISOString(),
        updatedAt: toDate(document.updatedAt).toISOString(),
        departmentIds: byDocument.get(document.id) ?? [],
      })),
      versions: versions.map((version) => ({
        documentId: version.documentId,
        version: version.version,
        title: version.title,
        category: version.category,
        summary: version.summary,
        content: version.content,
        visibility: version.visibility,
        departmentIds: normalizeNumberArray(version.departmentIds),
        changeNote: version.changeNote,
        createdById: version.createdById,
        createdAt: toDate(version.createdAt).toISOString(),
      })),
    };
  }

  public async createBackup(input: {
    readonly actorId: string;
    readonly title?: string;
  }): Promise<BackupView> {
    const snapshot = await this.buildSnapshot();
    const created = await this.repo<DocumentBackupRecord>(
      'documentBackups',
    ).createOne({
      values: {
        title:
          input.title ??
          `Backup ${snapshot.createdAt.slice(0, 19).replace('T', ' ')}`,
        documentCount: snapshot.documents.length,
        versionCount: snapshot.versions.length,
        snapshot: snapshot as unknown as Record<string, unknown>,
        createdById: input.actorId,
        createdAt: now(),
      },
    });
    const record = created.record;
    return {
      id: record.id,
      title: record.title,
      documentCount: record.documentCount,
      versionCount: record.versionCount,
      createdById: record.createdById,
      createdAt: record.createdAt,
    };
  }

  public async listBackups(): Promise<readonly BackupView[]> {
    const backups =
      await this.repo<DocumentBackupRecord>('documentBackups').findMany();
    return backups
      .map((backup) => ({
        id: backup.id,
        title: backup.title,
        documentCount: backup.documentCount,
        versionCount: backup.versionCount,
        createdById: backup.createdById,
        createdAt: backup.createdAt,
      }))
      .sort(
        (left, right) =>
          toDate(right.createdAt).getTime() -
            toDate(left.createdAt).getTime() || right.id - left.id,
      );
  }

  public async deleteBackup(backupId: number): Promise<void> {
    await this.requireBackup(backupId);
    await this.repo('documentBackups').deleteMany({ filter: { id: backupId } });
  }

  private async requireBackup(backupId: number): Promise<DocumentBackupRecord> {
    const backup = await this.repo<DocumentBackupRecord>(
      'documentBackups',
    ).findOne({ filter: { id: backupId } });
    if (!backup) {
      throw new DocumentCenterError(
        'BACKUP_NOT_FOUND',
        `Backup ${backupId} was not found.`,
      );
    }
    return backup;
  }

  /** The documents a restore would create, change, bring back or remove. */
  public async getBackupImpact(backupId: number): Promise<BackupImpact> {
    const backup = await this.requireBackup(backupId);
    const snapshot = parseSnapshot(backup.snapshot);
    const documents = await this.repo<DocumentRecord>('documents').findMany();
    const links = this.linksByDocument(await this.departmentLinks());

    const byId = new Map(documents.map((document) => [document.id, document]));
    const byCode = new Map(
      documents
        .filter((document) => document.code)
        .map((document) => [document.code as string, document]),
    );
    const matched = new Set<number>();
    const entries: BackupImpactEntry[] = [];

    for (const item of snapshot.documents) {
      const existing =
        (item.code ? byCode.get(item.code) : undefined) ?? byId.get(item.id);
      if (!existing) {
        entries.push({
          documentId: item.id,
          title: item.title,
          code: item.code,
          action: 'create',
        });
        continue;
      }
      matched.add(existing.id);
      const currentDepartmentIds = links.get(existing.id) ?? [];
      const snapshotDepartmentIds = item.departmentIds;
      if (existing.deletedAt && !item.deletedAt) {
        entries.push({
          documentId: existing.id,
          title: existing.title,
          code: existing.code,
          action: 'restore',
        });
        continue;
      }
      const changed =
        existing.title !== item.title ||
        existing.category !== item.category ||
        existing.summary !== item.summary ||
        existing.content !== item.content ||
        existing.status !== item.status ||
        existing.visibility !== item.visibility ||
        (existing.deletedAt === null
          ? null
          : (toNullableDate(existing.deletedAt)?.toISOString() ?? null)) !==
          item.deletedAt ||
        setOf(currentDepartmentIds) !== setOf(snapshotDepartmentIds);
      entries.push({
        documentId: existing.id,
        title: existing.title,
        code: existing.code,
        action: changed ? 'update' : 'unchanged',
      });
    }

    for (const document of documents) {
      if (matched.has(document.id)) continue;
      entries.push({
        documentId: document.id,
        title: document.title,
        code: document.code,
        action: 'delete',
      });
    }

    const summary = {
      create: countAction(entries, 'create'),
      update: countAction(entries, 'update'),
      restore: countAction(entries, 'restore'),
      delete: countAction(entries, 'delete'),
      unchanged: countAction(entries, 'unchanged'),
      total: entries.length,
    };
    return {
      backup: {
        id: backup.id,
        title: backup.title,
        documentCount: backup.documentCount,
        versionCount: backup.versionCount,
        createdById: backup.createdById,
        createdAt: backup.createdAt,
      },
      summary,
      documents: entries,
    };
  }

  /**
   * Replace the whole center with the backup: department links, versions and
   * documents are deleted and written back from the snapshot. Documents are
   * matched by business code (or id when they have none), so a document edited
   * since the backup is reverted in place and a document deleted since it is
   * brought back; documents that did not exist at backup time are removed.
   */
  public async restoreBackup(input: {
    readonly actorId: string;
    readonly backupId: number;
  }): Promise<{ readonly backupId: number; readonly documents: number }> {
    const backup = await this.requireBackup(input.backupId);
    const snapshot = parseSnapshot(backup.snapshot);
    const connection = this.connection();

    await connection.transaction(async (transaction) => {
      const documentRepo = transaction.repository<DocumentRecord>('documents');
      const linkRepo = transaction.repository<DocumentDepartmentRecord>(
        'documentDepartments',
      );
      const versionRepo =
        transaction.repository<DocumentVersionRecord>('documentVersions');
      const departmentRepo =
        transaction.repository<DepartmentRecord>('departments');

      // Empty the center in dependency order, then rebuild it.
      await linkRepo.deleteMany({ all: true });
      await versionRepo.deleteMany({ all: true });
      await documentRepo.deleteMany({ all: true });

      const departmentIdMap = new Map<number, number>();
      const currentDepartments = await departmentRepo.findMany();
      const departmentByCode = new Map(
        currentDepartments.map((department) => [department.code, department]),
      );
      for (const department of snapshot.departments) {
        let resolved = departmentByCode.get(department.code);
        if (!resolved) {
          const created = await departmentRepo.createOne({
            values: {
              code: department.code,
              title: department.title,
              description: department.description,
              sortOrder: department.sortOrder,
              active: department.active,
              createdAt: now(),
              updatedAt: now(),
            },
          });
          resolved = created.record;
        }
        departmentIdMap.set(department.id, resolved.id);
      }

      const documentIdMap = new Map<number, number>();
      for (const item of snapshot.documents) {
        const departmentIds = item.departmentIds
          .map((id) => departmentIdMap.get(id))
          .filter((id): id is number => id !== undefined);
        const createdAt = toDate(item.createdAt);
        const updatedAt = toDate(item.updatedAt);
        const deletedAt = toNullableDate(item.deletedAt);
        // The center was emptied above, so every document in the snapshot is
        // created fresh. A restore therefore rebuilds ids rather than trying to
        // keep them; the snapshot's own ids only key versions and links.
        const created = await documentRepo.createOne({
          values: {
            code: item.code,
            title: item.title,
            category: item.category,
            summary: item.summary,
            content: item.content,
            status: item.status,
            visibility: item.visibility,
            version: item.version,
            createdById: item.createdById,
            updatedById: item.updatedById,
            deletedAt,
            deletedById: item.deletedById,
            createdAt,
            updatedAt,
          },
        });
        const documentId = created.record.id;
        documentIdMap.set(item.id, documentId);
        for (const departmentId of departmentIds) {
          await linkRepo.createOne({
            values: { documentId, departmentId, createdAt: now() },
          });
        }
      }

      for (const item of snapshot.versions) {
        const documentId = documentIdMap.get(item.documentId);
        if (documentId === undefined) continue;
        const departmentIds = item.departmentIds
          .map((id) => departmentIdMap.get(id))
          .filter((id): id is number => id !== undefined);
        await versionRepo.createOne({
          values: {
            documentId,
            version: item.version,
            title: item.title,
            category: item.category,
            summary: item.summary,
            content: item.content,
            visibility: item.visibility,
            departmentIds,
            changeNote: item.changeNote,
            createdById: item.createdById,
            createdAt: toDate(item.createdAt),
          },
        });
      }
    });

    return {
      backupId: backup.id,
      documents: snapshot.documents.length,
    };
  }
}

function countAction(
  entries: readonly BackupImpactEntry[],
  action: BackupImpactAction,
): number {
  return entries.filter((entry) => entry.action === action).length;
}

/**
 * Registers the service and the settings item that protects the admin console
 * and the admin API.
 */
export class DocumentCenterProvider extends ServiceProvider<Application> {
  public readonly name: string = '@nocobase/nb3-factory/document-center';

  public override register(): void {
    this.app.container.singleton(documentCenterServiceToken, (container) => {
      return new DocumentCenterService(container.resolve(databaseManagerToken));
    });
  }

  public override boot(): Promise<void> {
    // The authorization plugin is enabled in this application, but it is an
    // optional plugin in the template's runtime: a runtime assembled without
    // it has no settings console to place the section in, and does not mount
    // the document routes that resolve the service either. Skip the UI
    // registration rather than fail the whole application startup.
    if (!this.app.container.has(authorizationToken)) {
      return Promise.resolve();
    }
    const authz = this.app.container.resolve(authorizationToken);
    // The section is a subsection of Administration, because a settings item can
    // be placed only in a subsection. The title and action are translated from
    // the application's client locale namespace.
    authz.ui.sections.add({
      name: 'documentCenter',
      title: {
        key: 'authorization.documentCenter.section',
        ns: DOCUMENT_CENTER_NAMESPACE,
      },
      parent: 'administration',
      order: 140,
    });
    authz.settings.add({
      id: DOCUMENT_CENTER_SETTINGS_ID,
      title: {
        key: 'authorization.documentCenter.title',
        ns: DOCUMENT_CENTER_NAMESPACE,
      },
      actions: [
        {
          name: 'manage',
          title: {
            key: 'authorization.documentCenter.manage',
            ns: DOCUMENT_CENTER_NAMESPACE,
          },
        },
      ],
    });
    authz.ui.place(
      { type: 'settings', id: DOCUMENT_CENTER_SETTINGS_ID },
      { section: 'documentCenter' },
    );
    return Promise.resolve();
  }
}
