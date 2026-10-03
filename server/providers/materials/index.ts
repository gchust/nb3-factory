import {
  databaseManagerToken,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { joinBasePath } from '@nocobase/app-server/support';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { Readable } from 'node:stream';
import type { Application } from '@nocobase/app-server/application';

/**
 * The drive manager's type is taken from the token rather than from
 * `@nocobase/drive`, which this application does not declare: it is an internal
 * dependency of the drive provider, and a type-only import of an undeclared
 * package is one more thing a deployment would have to resolve.
 */
type NocoBaseDriveManager =
  typeof driveManagerToken extends ServiceToken<infer T> ? T : never;

/** A row of the application-owned file Collection, as the database stores it. */
export interface ProjectAttachmentRow {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly ownerId: string;
  readonly materialId: string | null;
  readonly sort: number;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
}

/** A row of the material Collection, as the database stores it. */
export interface ProjectMaterialRow {
  readonly id: string;
  readonly title: string;
  readonly ownerId: string;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
}

/** An attachment as the client sees it. `contentUrl` points at the protected route. */
export interface ProjectMaterialAttachment {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
  readonly contentUrl: string;
}

/** A material as the client sees it. */
export interface ProjectMaterial {
  readonly id: string;
  readonly title: string;
  readonly ownerId: string;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
  readonly attachments: readonly ProjectMaterialAttachment[];
}

export interface MaterialInput {
  readonly title?: unknown;
  readonly attachmentIds?: unknown;
}

export type MaterialValidationCode =
  | 'TITLE_REQUIRED'
  | 'TITLE_TOO_LONG'
  | 'ATTACHMENT_NOT_FOUND'
  | 'ATTACHMENT_IDS_INVALID';

export class MaterialValidationError extends Error {
  readonly code: MaterialValidationCode;

  constructor(code: MaterialValidationCode, message: string) {
    super(message);
    this.name = 'MaterialValidationError';
    this.code = code;
  }
}

export interface ResolvedAttachment {
  readonly status: 'ok' | 'missing' | 'forbidden';
  readonly record?: ProjectAttachmentRow;
}

const MAX_TITLE_LENGTH = 255;

function isPlainString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * The application's material domain.
 *
 * Ownership is enforced here rather than left to the HTTP layer: every read and
 * write carries the caller's `ownerId` in its filter, so a material or a file
 * belonging to someone else is not reachable even when its id is known. The HTTP
 * routes only translate the result into a status code.
 */
export class ProjectMaterialsService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly drive: NocoBaseDriveManager,
    private readonly publicBasePath: () => string,
  ) {}

  private materials(): Repository<ProjectMaterialRow> {
    return this.database.repository('projectMaterials');
  }

  private attachments(): Repository<ProjectAttachmentRow> {
    return this.database.repository('projectAttachments');
  }

  private contentUrl(id: string): string {
    return joinBasePath(
      this.publicBasePath(),
      `/api/project-attachments/${encodeURIComponent(id)}/content`,
    );
  }

  private async ownedAttachments(
    ownerId: string,
  ): Promise<ProjectAttachmentRow[]> {
    return this.attachments().findMany({
      filter: { ownerId },
      sort: (sort) => sort.field('sort').asc(),
    });
  }

  private toMaterial(
    row: ProjectMaterialRow,
    files: readonly ProjectAttachmentRow[],
  ): ProjectMaterial {
    return {
      id: row.id,
      title: row.title,
      ownerId: row.ownerId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      attachments: files.map((file) => ({
        id: file.id,
        filename: file.filename,
        ext: file.ext,
        mimeType: file.mimeType,
        size: file.size,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        contentUrl: this.contentUrl(file.id),
      })),
    };
  }

  private async forRows(
    rows: readonly ProjectMaterialRow[],
    ownerId: string,
  ): Promise<ProjectMaterial[]> {
    const files = await this.ownedAttachments(ownerId);
    return rows.map((row) =>
      this.toMaterial(
        row,
        files
          .filter((file) => file.materialId === row.id)
          .sort((left, right) => left.sort - right.sort),
      ),
    );
  }

  async list(ownerId: string): Promise<ProjectMaterial[]> {
    const rows = await this.materials().findMany({
      filter: { ownerId },
      sort: (sort) => sort.field('createdAt').desc(),
    });
    return this.forRows(rows, ownerId);
  }

  async get(ownerId: string, id: string): Promise<ProjectMaterial | undefined> {
    const row = await this.materials().findOne({ filter: { id, ownerId } });
    if (!row) return undefined;
    return (await this.forRows([row], ownerId))[0];
  }

  async create(
    ownerId: string,
    input: MaterialInput,
  ): Promise<ProjectMaterial> {
    const title = this.readTitle(input.title, true);
    const ids = await this.resolveAttachmentIds(ownerId, input.attachmentIds);
    const now = new Date();
    const id = crypto.randomUUID();

    await this.database.transaction(async (connection) => {
      await connection
        .repository<ProjectMaterialRow>('projectMaterials')
        .createOne({
          values: { id, title, ownerId, createdAt: now, updatedAt: now },
        });
      const attachments =
        connection.repository<ProjectAttachmentRow>('projectAttachments');
      for (const [index, attachmentId] of ids.entries()) {
        await attachments.updateOne({
          filter: { id: attachmentId, ownerId },
          values: { materialId: id, sort: index },
        });
      }
    });

    const created = await this.get(ownerId, id);
    if (!created) throw new Error('The material was not created.');
    return created;
  }

  async update(
    ownerId: string,
    id: string,
    input: MaterialInput,
  ): Promise<ProjectMaterial | undefined> {
    const existing = await this.materials().findOne({
      filter: { id, ownerId },
    });
    if (!existing) return undefined;
    const title =
      input.title === undefined
        ? existing.title
        : this.readTitle(input.title, false);
    const hasAttachmentChange = input.attachmentIds !== undefined;
    const ids = hasAttachmentChange
      ? await this.resolveAttachmentIds(ownerId, input.attachmentIds)
      : [];

    await this.database.transaction(async (connection) => {
      const attachments =
        connection.repository<ProjectAttachmentRow>('projectAttachments');
      if (hasAttachmentChange) {
        // Detach first, then re-attach in order: a file removed from the form is
        // no longer part of the material, but its row and stored object remain.
        await attachments.updateMany({
          filter: { materialId: id, ownerId },
          values: { materialId: null },
        });
        for (const [index, attachmentId] of ids.entries()) {
          await attachments.updateOne({
            filter: { id: attachmentId, ownerId },
            values: { materialId: id, sort: index },
          });
        }
      }
      await connection
        .repository<ProjectMaterialRow>('projectMaterials')
        .updateOne({
          filter: { id, ownerId },
          values: { title, updatedAt: new Date() },
        });
    });

    return this.get(ownerId, id);
  }

  /**
   * Resolve one attachment for the protected content route.
   *
   * A missing row and another user's row are distinguished so the route can
   * answer 404 for the first and 403 for the second.
   */
  async resolveAttachment(
    ownerId: string,
    attachmentId: string,
  ): Promise<ResolvedAttachment> {
    const record = await this.attachments().findOne({
      filter: { id: attachmentId },
    });
    if (!record) return { status: 'missing' };
    if (record.ownerId !== ownerId) return { status: 'forbidden' };
    return { status: 'ok', record };
  }

  /** The stored bytes of an attachment the caller already owns. */
  async readAttachment(
    record: ProjectAttachmentRow,
  ): Promise<Readable | undefined> {
    const disk = this.drive.use(record.disk);
    if (!(await disk.exists(record.key))) return undefined;
    return disk.getStream(record.key);
  }

  private readTitle(value: unknown, required: boolean): string {
    if (value === undefined && !required) return '';
    if (!isPlainString(value) || value.trim().length === 0) {
      throw new MaterialValidationError(
        'TITLE_REQUIRED',
        'A title is required before the material can be saved.',
      );
    }
    const title = value.trim();
    if (title.length > MAX_TITLE_LENGTH) {
      throw new MaterialValidationError(
        'TITLE_TOO_LONG',
        `The title must be at most ${MAX_TITLE_LENGTH} characters.`,
      );
    }
    return title;
  }

  private async resolveAttachmentIds(
    ownerId: string,
    value: unknown,
  ): Promise<string[]> {
    if (value === undefined || value === null) return [];
    if (
      !Array.isArray(value) ||
      !value.every((id) => isPlainString(id) && id.length > 0)
    ) {
      throw new MaterialValidationError(
        'ATTACHMENT_IDS_INVALID',
        'attachmentIds must be a list of attachment identifiers.',
      );
    }
    const ids = [...new Set(value as string[])];
    if (!ids.length) return [];
    const owned = await this.attachments().findMany({ filter: { ownerId } });
    const ownedIds = new Set(owned.map((file) => file.id));
    for (const id of ids) {
      if (!ownedIds.has(id)) {
        throw new MaterialValidationError(
          'ATTACHMENT_NOT_FOUND',
          'An attachment was not found or does not belong to you.',
        );
      }
    }
    return ids;
  }
}

export const projectMaterialsServiceToken =
  createServiceToken<ProjectMaterialsService>('project-materials');

export class ProjectMaterialsServiceProvider extends ServiceProvider<Application> {
  readonly name: string = 'project-materials';

  register(): void {
    const app = this.app;
    app.container.singleton(projectMaterialsServiceToken, (container) => {
      const database = container.resolve(databaseManagerToken);
      const drive = container.resolve(driveManagerToken);
      return new ProjectMaterialsService(
        database,
        drive,
        () => app.publicBasePath,
      );
    });
  }
}
