import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type {
  DatabaseManager,
  RepositoryMutationScalarValue,
} from '@nocobase/db';
import { driveManagerToken } from '@nocobase/app-server/drive';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { Logger } from '@nocobase/logging';
import type { ServiceResolver } from '@nocobase/service-provider';
import type { ServiceAttachmentRecord } from './records.js';

/**
 * Attachments for tickets and manual documents. Ticket attachments accept PNG
 * images and DOCX documents — a screenshot of the fault and a service report.
 * Manual documents additionally accept Markdown, whose text is read into the
 * manual's own searchable body. The content route is authenticated and checks
 * the caller's access to the owning ticket or the published manual; it never
 * exposes a public object URL.
 *
 * The file plugin's own repository is deliberately not used here: it requires a
 * Repository Policy and a public content route keyed by UUID, neither of which
 * fits a confidential service ticket.
 */

export interface AttachmentStream {
  filename: string;
  mimeType: string;
  ext: string;
  size: number;
  stream: Readable;
}

export type AttachmentOwner =
  { kind: 'ticket'; id: number } | { kind: 'manual'; id: number };

export interface UploadAttachmentInput {
  file: File;
  disk?: string;
  category?: string;
  owner?: AttachmentOwner;
  uploadedById: string | null;
}

interface AttachmentFormat {
  mimeType: string;
  ext: string;
}

const FORMATS: Record<string, AttachmentFormat> = {
  'image/png': { mimeType: 'image/png', ext: 'png' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: 'docx',
  },
};

/**
 * Manual documents may additionally be Markdown. A Markdown file is plain
 * UTF-8 text, so it has no magic bytes: it is accepted for a manual owner
 * alone, and its text is read into the manual's searchable body.
 */
const MARKDOWN_FORMAT: AttachmentFormat = {
  mimeType: 'text/markdown',
  ext: 'md',
};

const EXT_BY_MIME = new Map(
  Object.values(FORMATS).map((format) => [format.mimeType, format.ext]),
);

const MAX_SIZE = 10 * 1024 * 1024;

/**
 * The leading bytes each accepted format must actually begin with. A declared
 * content type and a file name are caller-supplied, so they select the
 * expected format but never prove it; only the bytes do. A PNG must open with
 * its 8-byte signature, and a DOCX is an OpenXML package, so it must open with
 * the ZIP local-file-header marker.
 */
const SIGNATURES: Record<string, readonly number[]> = {
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    0x50, 0x4b,
  ],
};

async function matchesSignature(
  file: File,
  format: AttachmentFormat,
): Promise<boolean> {
  const signature = SIGNATURES[format.mimeType];
  if (!signature) return false;
  const head = new Uint8Array(
    await file.slice(0, signature.length).arrayBuffer(),
  );
  if (head.length < signature.length) return false;
  return signature.every((byte, index) => head[index] === byte);
}

export class ServiceAttachmentService {
  public constructor(
    private readonly database: DatabaseManager,
    private readonly resolver: ServiceResolver,
    private readonly logger: Logger,
    private readonly diskName?: string,
  ) {}

  /** True when the file is one of the accepted attachment formats. */
  public static isAccepted(file: File, owner?: AttachmentOwner): boolean {
    return resolveFormat(file, owner) !== null;
  }

  public async upload(
    input: UploadAttachmentInput,
  ): Promise<ServiceAttachmentRecord> {
    const file = input.file;
    const format = resolveFormat(file, input.owner);
    if (!format) {
      const ownerNote =
        input.owner?.kind === 'manual'
          ? ' Only PNG images, DOCX documents and Markdown files can be attached.'
          : ' Only PNG images and DOCX documents can be attached.';
      throw new AttachmentError(
        'unsupported_format',
        `The file format is not accepted.${ownerNote}`,
      );
    }
    if (file.size > MAX_SIZE) {
      throw new AttachmentError(
        'file_too_large',
        'Attachments may not exceed 10 MB.',
      );
    }
    if (format.ext !== 'md' && !(await matchesSignature(file, format))) {
      throw new AttachmentError(
        'unsupported_format',
        'The file content does not match the declared PNG or DOCX format.',
      );
    }
    const diskName = input.disk ?? this.diskName ?? 'local';
    const disk = this.driveManager().use(diskName as never);
    const id = randomUUID();
    const key = `service-attachments/${id}.${format.ext}`;
    const timestamp = new Date().toISOString();
    const fileStream = file.stream();
    try {
      await disk.putStream(key, Readable.fromWeb(fileStream as never), {
        contentType: format.mimeType,
        contentLength: file.size,
      });
    } catch (error) {
      this.logger.error({ err: error, key }, 'attachment upload failed');
      throw new AttachmentError(
        'storage_failure',
        'The attachment could not be stored.',
      );
    }
    const values: Record<string, RepositoryMutationScalarValue> = {
      id,
      disk: diskName,
      key,
      filename: file.name || `attachment.${format.ext}`,
      ext: format.ext,
      mimeType: format.mimeType,
      size: file.size,
      category: input.category ?? 'other',
      uploadedById: input.uploadedById,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (input.owner?.kind === 'ticket') {
      values.ticketId = input.owner.id;
    } else if (input.owner?.kind === 'manual') {
      values.manualId = input.owner.id;
    }
    try {
      const { record } = await this.database
        .repository<ServiceAttachmentRecord>('serviceAttachments')
        .createOne({ values });
      return record;
    } catch (error) {
      // The bytes are already stored; remove them rather than leave an orphan.
      await disk.delete(key).catch(() => undefined);
      throw error;
    }
  }

  public async get(id: string): Promise<ServiceAttachmentRecord | undefined> {
    return this.database
      .repository<ServiceAttachmentRecord>('serviceAttachments')
      .findOne({ filter: { id } });
  }

  public async open(
    record: ServiceAttachmentRecord,
  ): Promise<AttachmentStream> {
    const disk = this.driveManager().use(String(record.disk) as never);
    const stream = await disk.getStream(String(record.key));
    return {
      filename: String(record.filename),
      mimeType: String(record.mimeType),
      ext: String(record.ext),
      size: Number(record.size),
      stream,
    };
  }

  public async remove(record: ServiceAttachmentRecord): Promise<void> {
    const disk = this.driveManager().use(String(record.disk) as never);
    try {
      await disk.delete(String(record.key));
    } catch (error) {
      this.logger.warn(
        { err: error, key: String(record.key) },
        'attachment object delete failed; removing metadata anyway',
      );
    }
    await this.database
      .repository<ServiceAttachmentRecord>('serviceAttachments')
      .deleteOne({ filter: { id: String(record.id) } });
  }

  public async listForTicket(
    ticketId: number,
  ): Promise<ServiceAttachmentRecord[]> {
    return this.database
      .repository<ServiceAttachmentRecord>('serviceAttachments')
      .findMany({
        filter: { ticketId },
        sort: (sort) => sort.field('createdAt').asc(),
      });
  }

  public async listForManual(
    manualId: number,
  ): Promise<ServiceAttachmentRecord[]> {
    return this.database
      .repository<ServiceAttachmentRecord>('serviceAttachments')
      .findMany({
        filter: { manualId },
        sort: (sort) => sort.field('createdAt').asc(),
      });
  }

  private driveManager(): NocoBaseDriveManager {
    return this.resolver.resolve(driveManagerToken);
  }
}

export class AttachmentError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AttachmentError';
  }
}

function resolveFormat(
  file: File,
  owner?: AttachmentOwner,
): AttachmentFormat | null {
  const declared = (file.type || '').toLowerCase();
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (
    owner?.kind === 'manual' &&
    (declared === 'text/markdown' || ext === 'md')
  ) {
    return MARKDOWN_FORMAT;
  }
  if (EXT_BY_MIME.has(declared)) {
    return FORMATS[declared] ?? null;
  }
  if (ext === 'png') return FORMATS['image/png'];
  if (ext === 'docx') {
    return FORMATS[
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
  }
  // A generic upload content type is accepted only when the extension already
  // proved the format; anything else is refused.
  return null;
}
