import {
  serverFileRepositoryManagerToken,
  type ServerFileRepository,
} from '@nocobase/app-plugin-file/server';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';
import {
  createServiceToken,
  type ServiceResolver,
} from '@nocobase/service-provider';
import { textValue } from './text.js';
import type { ServiceModuleConfig } from '../config/service.js';
import {
  ServiceError,
  serviceAccessToken,
  type ServiceIdentity,
  type ServiceTicketScopeRow,
} from './access.js';

/**
 * Business attachments.
 *
 * Uploads go through the File Repository so storage, naming and validation
 * stay with the plugin. Content is served by this module's own authenticated
 * route rather than the plugin's public content path, because a service
 * attachment belongs to a ticket or an article and must not be fetchable by
 * anyone who merely knows its URL.
 */

export const serviceAttachmentToken =
  createServiceToken<ServiceAttachmentService>('service.attachments');

const ATTACHMENT_COLLECTION = 'service_attachments';

export interface ServiceAttachment {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: string | number;
  readonly ticketId: number | null;
  readonly knowledgeArticleId: number | null;
  readonly uploaderId: string | null;
  readonly createdAt: string;
  /** App-relative path; the client resolves it against the application base. */
  readonly contentUrl: string;
}

export class ServiceAttachmentService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly container: ServiceResolver,
    private readonly config: ServiceModuleConfig,
  ) {}

  /** Validates the type and size, stores the file, then records the link. */
  async upload(input: {
    readonly file: File;
    readonly identity: ServiceIdentity;
    readonly ticketId?: number | null;
    readonly knowledgeArticleId?: number | null;
  }): Promise<ServiceAttachment> {
    const { file } = input;
    const ext = extensionOf(file.name);
    const allowed = this.config.attachments.allowedExtensions.map((value) =>
      value.toLowerCase(),
    );
    if (!allowed.includes(ext)) {
      throw new ServiceError(
        415,
        'ATTACHMENT_TYPE_NOT_ALLOWED',
        `Files of type .${ext || 'unknown'} are not accepted.`,
      );
    }
    const maxBytes = this.config.attachments.maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new ServiceError(
        413,
        'ATTACHMENT_TOO_LARGE',
        `Attachments must be at most ${this.config.attachments.maxSizeMb} MB.`,
      );
    }

    const repository = this.repository();
    const result = await repository.uploadOne({ file });
    const id = result.record.id;
    const now = new Date().toISOString();
    await this.database
      .query()
      .updateTable(ATTACHMENT_COLLECTION)
      .set({
        ticketId: input.ticketId ?? null,
        knowledgeArticleId: input.knowledgeArticleId ?? null,
        uploaderId: input.identity.userId,
        updatedAt: now,
      })
      .where('id', '=', id)
      .execute();
    return this.get(id, input.identity);
  }

  /** Attachments of a ticket or an article, newest first. */
  async list(input: {
    readonly ticketId?: number | null;
    readonly knowledgeArticleId?: number | null;
  }): Promise<ServiceAttachment[]> {
    let query = this.database
      .query()
      .selectFrom(ATTACHMENT_COLLECTION)
      .selectAll()
      .orderBy('createdAt', 'desc');
    if (input.ticketId !== undefined && input.ticketId !== null) {
      query = query.where('ticketId', '=', input.ticketId);
    }
    if (
      input.knowledgeArticleId !== undefined &&
      input.knowledgeArticleId !== null
    ) {
      query = query.where('knowledgeArticleId', '=', input.knowledgeArticleId);
    }
    const rows = await query.execute<Row>();
    return rows.map((row) => normalizeAttachment(row));
  }

  /** Loads one attachment this identity is allowed to see. */
  async get(id: string, identity: ServiceIdentity): Promise<ServiceAttachment> {
    const row = await this.loadRow(id);
    await this.assertCanRead(row, identity);
    return normalizeAttachment(row);
  }

  /** Bytes for the authenticated content route. */
  async read(
    id: string,
    identity: ServiceIdentity,
  ): Promise<{ attachment: ServiceAttachment; bytes: Uint8Array }> {
    const row = await this.loadRow(id);
    await this.assertCanRead(row, identity);
    const disk = this.disk(row.disk as string);
    const bytes = await disk.getBytes(row.key as string);
    return { attachment: normalizeAttachment(row), bytes };
  }

  /** Removes the row and the stored object. */
  async remove(id: string, identity: ServiceIdentity): Promise<void> {
    const row = await this.loadRow(id);
    const access = this.container.resolve(serviceAccessToken);
    if (!identity.manageAll) {
      if (row.uploaderId !== identity.userId) {
        await this.assertCanRead(row, identity);
        throw new ServiceError(
          403,
          'ATTACHMENT_DELETE_DENIED',
          'Only the uploader or an administrator may remove this attachment.',
        );
      }
      access.requireMember(identity);
    }
    const disk = this.disk(row.disk as string);
    try {
      await disk.delete(row.key as string);
    } catch {
      // A missing object must not block removing a stale row.
    }
    await this.database
      .query()
      .deleteFrom(ATTACHMENT_COLLECTION)
      .where('id', '=', id)
      .execute();
  }

  private async assertCanRead(
    row: Row,
    identity: ServiceIdentity,
  ): Promise<void> {
    const access = this.container.resolve(serviceAccessToken);
    access.requireMember(identity);
    const ticketId =
      row.ticketId === null || row.ticketId === undefined
        ? null
        : Number(row.ticketId);
    if (ticketId !== null) {
      const ticket = await this.database
        .query()
        .selectFrom('service_tickets')
        .select(['id', 'region', 'assigneeId', 'reporterId', 'confidential'])
        .where('id', '=', ticketId)
        .executeTakeFirst<ServiceTicketScopeRow>();
      if (!ticket) {
        throw new ServiceError(
          404,
          'ATTACHMENT_NOT_FOUND',
          'Attachment not found.',
        );
      }
      await access.requireTicketRead(identity, ticket);
      return;
    }
    const articleId =
      row.knowledgeArticleId === null || row.knowledgeArticleId === undefined
        ? null
        : Number(row.knowledgeArticleId);
    if (articleId !== null) return;
    // Not yet linked to business data: only the uploader or an administrator.
    if (row.uploaderId === identity.userId || identity.manageAll) return;
    throw new ServiceError(
      404,
      'ATTACHMENT_NOT_FOUND',
      'Attachment not found.',
    );
  }

  private async loadRow(id: string): Promise<Row> {
    const row = await this.database
      .query()
      .selectFrom(ATTACHMENT_COLLECTION)
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<Row>();
    if (!row) {
      throw new ServiceError(
        404,
        'ATTACHMENT_NOT_FOUND',
        'Attachment not found.',
      );
    }
    return row;
  }

  private repository(): ServerFileRepository {
    const manager = this.container.resolve(serverFileRepositoryManagerToken);
    return manager.repository(ATTACHMENT_COLLECTION, {
      disk: this.config.attachments.disk,
      // The File Repository requires an access path, but this module serves
      // content through its own authenticated route and never exposes this one.
      accessPath: '/service/attachments/exposure',
      policy: {
        read: { scope: true },
        create: { scope: true },
        update: false,
        delete: false,
      },
    });
  }

  private disk(name: string): ServiceDisk {
    const manager = this.container.resolve(driveManagerToken);
    return manager.use(name);
  }
}

/** The slice of a Drive disk this module uses. */
interface ServiceDisk {
  getBytes(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf('.');
  return index === -1 ? '' : filename.slice(index + 1).toLowerCase();
}

function normalizeAttachment(row: Row): ServiceAttachment {
  const id = String(row.id);
  return {
    id,
    filename: textValue(row.filename),
    ext: textValue(row.ext),
    mimeType: textValue(row.mimeType, 'application/octet-stream'),
    size: (row.size as string | number) ?? 0,
    ticketId:
      row.ticketId === null || row.ticketId === undefined
        ? null
        : Number(row.ticketId),
    knowledgeArticleId:
      row.knowledgeArticleId === null || row.knowledgeArticleId === undefined
        ? null
        : Number(row.knowledgeArticleId),
    uploaderId: (row.uploaderId as string | null) ?? null,
    createdAt: textValue(row.createdAt),
    contentUrl: `/api/service/attachments/${id}`,
  };
}

export function createServiceAttachmentService(
  container: ServiceResolver,
  config: ServiceModuleConfig,
): ServiceAttachmentService {
  return new ServiceAttachmentService(
    container.resolve(databaseManagerToken),
    container,
    config,
  );
}
