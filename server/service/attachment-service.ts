import type { DatabaseManager } from '@nocobase/db';
import type { Readable } from 'node:stream';
import type { ServiceConfig } from '../config/service.js';
import type { ServiceLogger } from './logger.js';
import { asText } from './values.js';

interface DriveDiskLike {
  put(
    key: string,
    contents: Uint8Array,
    options?: { visibility?: 'public' | 'private' },
  ): Promise<void>;
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

interface DriveManagerLike {
  use(service?: string): DriveDiskLike;
}

export interface ServiceAttachment {
  id: string;
  orderId: number;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  kind: string;
  createdAt: string;
  previewable: boolean;
}

export interface UploadResult {
  attachment: ServiceAttachment;
  valid: true;
}

export class ServiceAttachmentError extends Error {
  constructor(
    readonly code:
      'NOT_FOUND' | 'UNSUPPORTED_TYPE' | 'TOO_LARGE' | 'CORRUPT' | 'EMPTY',
    message: string,
  ) {
    super(message);
    this.name = 'ServiceAttachmentError';
  }
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const DOCX_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) {
    return false;
  }
  return magic.every((value, index) => bytes[index] === value);
}

/**
 * Stores and serves the two attachment kinds the service workflow requires:
 * a PNG photographed on site and a DOCX repair report. Bytes live on the
 * configured drive; the database only holds metadata and the order link.
 *
 * Attachment bytes are never reachable without an order access check, and the
 * handling is deliberately independent of the file plugin's public byte route.
 */
export class ServiceAttachmentService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly drive: DriveManagerLike,
    private readonly config: ServiceConfig,
    private readonly logger: ServiceLogger,
  ) {}

  private disk(): DriveDiskLike {
    return this.drive.use();
  }

  async list(orderId: number): Promise<ServiceAttachment[]> {
    const rows = await this.database
      .query()
      .selectFrom('serviceOrderFiles as link')
      .innerJoin('serviceFiles as file', 'file.id', 'link.fileId')
      .select([
        'link.id as linkId',
        'link.orderId as orderId',
        'link.kind as kind',
        'link.createdAt as createdAt',
        'file.id as id',
        'file.filename as filename',
        'file.ext as ext',
        'file.mimeType as mimeType',
        'file.size as size',
      ])
      .where('link.orderId', '=', orderId)
      .orderBy('link.id', 'asc')
      .execute();
    return rows.map((row) =>
      this.toAttachment(row as unknown as AttachmentRow, orderId),
    );
  }

  async upload(
    orderId: number,
    actorId: string,
    file: File,
    kindHint?: string,
  ): Promise<UploadResult> {
    const filename = file.name || 'attachment';
    const ext = (filename.split('.').pop() ?? '').toLowerCase();
    const allowed = this.config.attachment.allowedExtensions;
    if (!allowed.includes(ext)) {
      throw new ServiceAttachmentError(
        'UNSUPPORTED_TYPE',
        `仅支持以下文件类型：${allowed.join('、')}。`,
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new ServiceAttachmentError('EMPTY', '文件内容为空。');
    }
    if (bytes.byteLength > this.config.attachment.maxBytes) {
      throw new ServiceAttachmentError(
        'TOO_LARGE',
        `文件超过 ${Math.round(this.config.attachment.maxBytes / 1024 / 1024)}MB 上限。`,
      );
    }
    if (ext === 'png' && !startsWith(bytes, PNG_MAGIC)) {
      throw new ServiceAttachmentError(
        'CORRUPT',
        'PNG 文件已损坏或格式不正确。',
      );
    }
    if (ext === 'docx' && !startsWith(bytes, DOCX_MAGIC)) {
      throw new ServiceAttachmentError(
        'CORRUPT',
        'DOCX 文件已损坏或格式不正确。',
      );
    }

    const mimeType =
      ext === 'png'
        ? 'image/png'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const id = crypto.randomUUID();
    const key = `service-files/${id}.${ext}`;
    const diskName = this.defaultDiskName();
    await this.disk().put(key, bytes, { visibility: 'private' });

    const now = new Date();
    const kind =
      kindHint === 'photo' || kindHint === 'document'
        ? kindHint
        : ext === 'png'
          ? 'photo'
          : 'document';
    await this.database.transaction(async (connection) => {
      await connection.query
        .insertInto('serviceFiles')
        .values({
          id,
          disk: diskName,
          key,
          filename,
          ext,
          mimeType,
          size: bytes.byteLength,
          uploadedById: actorId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await connection.query
        .insertInto('serviceOrderFiles')
        .values({
          orderId,
          fileId: id,
          kind,
          originalName: filename,
          uploadedById: actorId,
          createdAt: now,
        })
        .execute();
    });

    return {
      valid: true,
      attachment: {
        id,
        orderId,
        filename,
        ext,
        mimeType,
        size: bytes.byteLength,
        kind,
        createdAt: now.toISOString(),
        previewable: true,
      },
    };
  }

  async remove(orderId: number, fileId: string): Promise<boolean> {
    const link = await this.database
      .query()
      .selectFrom('serviceOrderFiles')
      .select('id')
      .where('orderId', '=', orderId)
      .where('fileId', '=', fileId)
      .executeTakeFirst();
    if (!link) {
      return false;
    }
    const file = await this.database
      .query()
      .selectFrom('serviceFiles')
      .select(['id', 'key'])
      .where('id', '=', fileId)
      .executeTakeFirst();
    await this.database.transaction(async (connection) => {
      await connection.query
        .deleteFrom('serviceOrderFiles')
        .where('orderId', '=', orderId)
        .where('fileId', '=', fileId)
        .execute();
      await connection.query
        .deleteFrom('serviceFiles')
        .where('id', '=', fileId)
        .execute();
    });
    if (file?.key) {
      try {
        await this.disk().delete(asText(file.key));
      } catch (error) {
        this.logger.warn('Service attachment object could not be removed', {
          fileId,
          error,
        });
      }
    }
    return true;
  }

  async openRead(
    orderId: number,
    fileId: string,
  ): Promise<{ attachment: ServiceAttachment; stream: Readable }> {
    const row = await this.database
      .query()
      .selectFrom('serviceOrderFiles as link')
      .innerJoin('serviceFiles as file', 'file.id', 'link.fileId')
      .select([
        'link.id as linkId',
        'link.orderId as orderId',
        'link.kind as kind',
        'link.createdAt as createdAt',
        'file.id as id',
        'file.filename as filename',
        'file.ext as ext',
        'file.mimeType as mimeType',
        'file.size as size',
        'file.key as key',
      ])
      .where('link.orderId', '=', orderId)
      .where('file.id', '=', fileId)
      .executeTakeFirst();
    if (!row) {
      throw new ServiceAttachmentError('NOT_FOUND', '附件不存在。');
    }
    const stream = await this.disk().getStream(String(row.key));
    return {
      attachment: this.toAttachment(row as unknown as AttachmentRow, orderId),
      stream,
    };
  }

  private defaultDiskName(): string {
    return this.config.attachment.disk;
  }

  private toAttachment(row: AttachmentRow, orderId: number): ServiceAttachment {
    const ext = String(row.ext ?? '');
    return {
      id: String(row.id),
      orderId,
      filename: String(row.filename ?? ''),
      ext,
      mimeType: String(row.mimeType ?? ''),
      size: Number(row.size ?? 0),
      kind: String(row.kind ?? 'other'),
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt ?? ''),
      previewable: ext === 'png' || ext === 'docx',
    };
  }
}

interface AttachmentRow {
  id: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: string | number;
  kind: string;
  createdAt: Date | string;
  key?: string;
}
