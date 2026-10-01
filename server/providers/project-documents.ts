import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import type { Application } from '@nocobase/app-server/application';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { AppDriveConfig } from '@nocobase/drive';
import {
  databaseManagerToken,
  type DatabaseConnection,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { joinBasePath } from '@nocobase/app-server/support';
import {
  serverFileRepositoryManagerToken,
  type ServerFileRepositoryManager,
} from '@nocobase/app-plugin-file/server';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceResolver,
} from '@nocobase/service-provider';

/**
 * Project documents: an owner's titled record of attachments.
 *
 * The device that decides what a caller may reach lives here, not in the HTTP
 * layer: every read and write is filtered by `ownerId`, so two people with
 * accounts in the same application never see each other's documents, and a
 * guessed identifier resolves to nothing rather than to somebody else's file.
 */

/** Every reason this feature refuses a request, mapped to a status by the route. */
export type ProjectDocumentErrorCode =
  | 'DOCUMENT_NOT_FOUND'
  | 'FILE_NOT_FOUND'
  | 'FILE_ALREADY_ATTACHED'
  | 'INVALID_TITLE'
  | 'UNSUPPORTED_FILE_TYPE';

export class ProjectDocumentError extends Error {
  readonly code: ProjectDocumentErrorCode;

  constructor(code: ProjectDocumentErrorCode, message: string) {
    super(message);
    this.name = 'ProjectDocumentError';
    this.code = code;
  }
}

/** An attachment as the browser sees it. `key` and `disk` stay server-side detail for deletion. */
export interface ProjectDocumentFileView {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly documentId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly contentUrl: string;
}

export interface ProjectDocumentView {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly files: ProjectDocumentFileView[];
}

/** What the content route needs to stream one attachment. */
export interface ProjectDocumentAttachment {
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly stream: Readable;
}

export interface ProjectDocumentInput {
  readonly title: string;
  readonly fileIds: readonly string[];
}

export interface ProjectDocumentService {
  list(ownerId: string): Promise<ProjectDocumentView[]>;
  get(ownerId: string, id: string): Promise<ProjectDocumentView>;
  create(
    ownerId: string,
    input: ProjectDocumentInput,
  ): Promise<ProjectDocumentView>;
  update(
    ownerId: string,
    id: string,
    input: ProjectDocumentInput,
  ): Promise<ProjectDocumentView>;
  remove(ownerId: string, id: string): Promise<void>;
  upload(ownerId: string, file: File): Promise<ProjectDocumentFileView>;
  readAttachment(
    ownerId: string,
    fileId: string,
  ): Promise<ProjectDocumentAttachment | undefined>;
}

interface ProjectDocumentRow {
  id: string;
  title: string;
  ownerId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface ProjectDocumentFileRow {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number | string | bigint;
  documentId: string | null;
  ownerId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ProjectDocumentServiceOptions {
  readonly database: DatabaseManager;
  readonly drive: NocoBaseDriveManager;
  readonly files: ServerFileRepositoryManager;
  readonly disk: string;
  readonly accessPath: string;
  readonly contentUrl: (fileId: string) => string;
  readonly connection?: string;
}

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * First version accepts the two formats the issue names: a PNG photo and a DOCX
 * document. The extension decides, and a browser-supplied MIME narrows it
 * rather than widening it, so a renamed executable cannot arrive as a "photo".
 */
function assertSupported(file: File): void {
  const dot = file.name.lastIndexOf('.');
  const extension = dot < 0 ? '' : file.name.slice(dot + 1).toLowerCase();
  const mime = (file.type || '').split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const supported =
    (extension === 'png' && (mime === '' || mime === 'image/png')) ||
    (extension === 'docx' && (mime === '' || mime === DOCX_MIME));
  if (!supported) {
    throw new ProjectDocumentError(
      'UNSUPPORTED_FILE_TYPE',
      'Only PNG images and DOCX documents can be attached.',
    );
  }
}

function toIso(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  return value ?? '';
}

function normalizeTitle(value: unknown): string {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title || title.length > 255) {
    throw new ProjectDocumentError(
      'INVALID_TITLE',
      'A document needs a title of at most 255 characters.',
    );
  }
  return title;
}

export class DefaultProjectDocumentService implements ProjectDocumentService {
  private readonly database: DatabaseManager;
  private readonly drive: NocoBaseDriveManager;
  private readonly files: ServerFileRepositoryManager;
  private readonly disk: string;
  private readonly accessPath: string;
  private readonly contentUrl: (fileId: string) => string;
  private readonly connectionName: string;

  constructor(options: ProjectDocumentServiceOptions) {
    this.database = options.database;
    this.drive = options.drive;
    this.files = options.files;
    this.disk = options.disk;
    this.accessPath = options.accessPath;
    this.contentUrl = options.contentUrl;
    this.connectionName = options.connection ?? 'main';
  }

  async list(ownerId: string): Promise<ProjectDocumentView[]> {
    const connection = this.connection();
    const documents = await this.documents(connection).findMany({
      filter: { ownerId },
      sort: (sort) => sort.field('createdAt').desc(),
    });
    const files = await this.fileRows(connection).findMany({
      filter: { ownerId },
    });
    const byDocument = new Map<string, ProjectDocumentFileView[]>();
    for (const file of files) {
      if (!file.documentId) continue;
      const list = byDocument.get(file.documentId) ?? [];
      list.push(this.toFileView(file));
      byDocument.set(file.documentId, list);
    }
    return documents.map((document) => ({
      id: document.id,
      title: document.title,
      createdAt: toIso(document.createdAt),
      updatedAt: toIso(document.updatedAt),
      files: byDocument.get(document.id) ?? [],
    }));
  }

  async get(ownerId: string, id: string): Promise<ProjectDocumentView> {
    const connection = this.connection();
    const document = await this.findDocument(connection, ownerId, id);
    if (!document) {
      throw new ProjectDocumentError(
        'DOCUMENT_NOT_FOUND',
        'The document does not exist.',
      );
    }
    const files = await this.fileRows(connection).findMany({
      filter: { documentId: id, ownerId },
    });
    return this.toDocumentView(
      document,
      files.sort((left, right) =>
        String(left.createdAt).localeCompare(String(right.createdAt)),
      ),
    );
  }

  async create(
    ownerId: string,
    input: ProjectDocumentInput,
  ): Promise<ProjectDocumentView> {
    const title = normalizeTitle(input.title);
    const fileIds = this.uniqueFileIds(input.fileIds);
    return this.database.transaction(async (connection) => {
      await this.assertAttachable(connection, ownerId, fileIds);
      const id = randomUUID();
      const now = new Date().toISOString();
      await this.documents(connection).createOne({
        values: { id, title, ownerId, createdAt: now, updatedAt: now },
      });
      await this.attachFiles(connection, fileIds, id, now);
      const document = await this.findDocument(connection, ownerId, id);
      if (!document) {
        throw new ProjectDocumentError(
          'DOCUMENT_NOT_FOUND',
          'The document does not exist.',
        );
      }
      const files = await this.fileRows(connection).findMany({
        filter: { documentId: id, ownerId },
      });
      return this.toDocumentView(document, files);
    }, this.connectionName);
  }

  async update(
    ownerId: string,
    id: string,
    input: ProjectDocumentInput,
  ): Promise<ProjectDocumentView> {
    const title = normalizeTitle(input.title);
    const fileIds = this.uniqueFileIds(input.fileIds);
    const removed = await this.database.transaction(async (connection) => {
      const document = await this.findDocument(connection, ownerId, id);
      if (!document) {
        throw new ProjectDocumentError(
          'DOCUMENT_NOT_FOUND',
          'The document does not exist.',
        );
      }
      const attached = await this.fileRows(connection).findMany({
        filter: { documentId: id, ownerId },
      });
      await this.assertAttachable(
        connection,
        ownerId,
        fileIds,
        new Set(attached.map((file) => file.id)),
      );
      const now = new Date().toISOString();
      await this.documents(connection).updateMany({
        filter: { id, ownerId },
        values: { title, updatedAt: now },
      });
      const keep = new Set(fileIds);
      const orphans = attached.filter((file) => !keep.has(file.id));
      await this.attachFiles(connection, fileIds, id, now);
      for (const orphan of orphans) {
        await this.fileRows(connection).deleteOne({
          filter: { id: orphan.id, ownerId },
        });
      }
      const current = await this.fileRows(connection).findMany({
        filter: { documentId: id, ownerId },
      });
      return {
        view: this.toDocumentView(document, current),
        orphans,
      };
    }, this.connectionName);
    await this.deleteObjects(removed.orphans);
    return removed.view;
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const orphans = await this.database.transaction(async (connection) => {
      const document = await this.findDocument(connection, ownerId, id);
      if (!document) {
        throw new ProjectDocumentError(
          'DOCUMENT_NOT_FOUND',
          'The document does not exist.',
        );
      }
      const files = await this.fileRows(connection).findMany({
        filter: { documentId: id, ownerId },
      });
      for (const file of files) {
        await this.fileRows(connection).deleteOne({
          filter: { id: file.id, ownerId },
        });
      }
      await this.documents(connection).deleteMany({ filter: { id, ownerId } });
      return files;
    }, this.connectionName);
    await this.deleteObjects(orphans);
  }

  async upload(ownerId: string, file: File): Promise<ProjectDocumentFileView> {
    assertSupported(file);
    const repository = this.files.repository('project_document_files', {
      connection: this.connectionName,
      disk: this.disk,
      accessPath: this.accessPath,
      policy: {
        read: true,
        create: { scope: true, defaults: { ownerId } },
        update: false,
        delete: false,
      },
    });
    const result = await repository.uploadOne({ file });
    return this.toFileView({
      ...(result.record as ProjectDocumentFileRow),
      documentId: null,
      ownerId,
    });
  }

  async readAttachment(
    ownerId: string,
    fileId: string,
  ): Promise<ProjectDocumentAttachment | undefined> {
    const file = await this.fileRows().findOne({
      filter: { id: fileId, ownerId },
    });
    if (!file) return undefined;
    const disk = this.drive.use(file.disk || this.disk);
    if (!(await disk.exists(file.key))) return undefined;
    return {
      filename: file.filename,
      mimeType: file.mimeType,
      size: Number(file.size),
      stream: await disk.getStream(file.key),
    };
  }

  private connection(): DatabaseConnection {
    return this.database.connection(this.connectionName);
  }

  private documents(
    connection: DatabaseConnection,
  ): Repository<ProjectDocumentRow> {
    return connection.repository<ProjectDocumentRow>('project_documents');
  }

  private fileRows(
    connection: DatabaseConnection = this.connection(),
  ): Repository<ProjectDocumentFileRow> {
    return connection.repository<ProjectDocumentFileRow>(
      'project_document_files',
    );
  }

  private async findDocument(
    connection: DatabaseConnection,
    ownerId: string,
    id: string,
  ): Promise<ProjectDocumentRow | undefined> {
    return this.documents(connection).findOne({ filter: { id, ownerId } });
  }

  private uniqueFileIds(fileIds: readonly string[]): string[] {
    const unique = new Set(
      fileIds.filter(
        (value): value is string => typeof value === 'string' && value !== '',
      ),
    );
    return [...unique];
  }

  /**
   * Attach each file in its own write. The Repository filter language has no
   * `in` operator, and a document carries a handful of attachments, so a loop
   * is clearer than composing an `or` tree of equality conditions.
   */
  private async attachFiles(
    connection: DatabaseConnection,
    fileIds: readonly string[],
    documentId: string,
    now: string,
  ): Promise<void> {
    for (const fileId of fileIds) {
      await this.fileRows(connection).updateOne({
        filter: { id: fileId },
        values: { documentId, updatedAt: now },
      });
    }
  }

  private async assertAttachable(
    connection: DatabaseConnection,
    ownerId: string,
    fileIds: readonly string[],
    alreadyAttached: ReadonlySet<string> = new Set(),
  ): Promise<void> {
    for (const fileId of fileIds) {
      if (alreadyAttached.has(fileId)) continue;
      const file = await this.fileRows(connection).findOne({
        filter: { id: fileId },
      });
      if (!file || file.ownerId !== ownerId) {
        throw new ProjectDocumentError(
          'FILE_NOT_FOUND',
          'An attachment does not exist.',
        );
      }
      if (file.documentId) {
        throw new ProjectDocumentError(
          'FILE_ALREADY_ATTACHED',
          'An attachment already belongs to another document.',
        );
      }
    }
  }

  /** Best-effort object removal after the row is gone: an orphaned object is recoverable, a missing one is not. */
  private async deleteObjects(
    files: readonly ProjectDocumentFileRow[],
  ): Promise<void> {
    await Promise.allSettled(
      files.map((file) =>
        this.drive.use(file.disk || this.disk).delete(file.key),
      ),
    );
  }

  private toDocumentView(
    document: ProjectDocumentRow,
    files: readonly ProjectDocumentFileRow[],
  ): ProjectDocumentView {
    return {
      id: document.id,
      title: document.title,
      createdAt: toIso(document.createdAt),
      updatedAt: toIso(document.updatedAt),
      files: files.map((file) => this.toFileView(file)),
    };
  }

  private toFileView(file: ProjectDocumentFileRow): ProjectDocumentFileView {
    return {
      id: file.id,
      disk: file.disk,
      key: file.key,
      filename: file.filename,
      ext: file.ext,
      mimeType: file.mimeType,
      size: Number(file.size),
      documentId: file.documentId ?? null,
      createdAt: toIso(file.createdAt),
      updatedAt: toIso(file.updatedAt),
      contentUrl: this.contentUrl(file.id),
    };
  }
}

export const projectDocumentServiceToken =
  createServiceToken<ProjectDocumentService>('project-documents');

export class ProjectDocumentServiceProvider extends ServiceProvider<Application> {
  readonly name: string = '@app/project-documents';

  override register(): void {
    this.app.container.singleton(projectDocumentServiceToken, (resolver) =>
      createProjectDocumentService(resolver, this.app),
    );
  }
}

function createProjectDocumentService(
  resolver: ServiceResolver,
  app: Application,
): ProjectDocumentService {
  const driveConfig = app.config.get<AppDriveConfig>('drive');
  return new DefaultProjectDocumentService({
    database: resolver.resolve(databaseManagerToken),
    drive: resolver.resolve(driveManagerToken),
    files: resolver.resolve(serverFileRepositoryManagerToken),
    disk: driveConfig?.default ?? 'local',
    accessPath: joinBasePath(
      app.publicBasePath,
      '/api/project-documents/files',
    ),
    contentUrl: (fileId: string): string =>
      joinBasePath(
        app.publicBasePath,
        `/api/project-documents/files/${encodeURIComponent(fileId)}/content`,
      ),
  });
}
