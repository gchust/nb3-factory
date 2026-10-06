import { randomUUID } from 'node:crypto';

import {
  databaseManagerToken,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

/** A material row. `createdById` is the owner; nothing else may read or change the row. */
export interface ProjectMaterialRecord {
  readonly id: string;
  readonly title: string;
  readonly createdById: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * An attachment row. The columns up to `updatedAt` are the ones the File plugin
 * requires of a file Collection; `materialId` is null while the upload is still
 * a draft that has not been saved into a material.
 */
export interface ProjectMaterialAttachmentRecord {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number | string;
  readonly createdById: string;
  readonly materialId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectMaterial extends ProjectMaterialRecord {
  readonly attachments: ProjectMaterialAttachmentRecord[];
}

/** Values a create or update request carries. `attachmentIds` are already-uploaded, owned attachment ids. */
export interface ProjectMaterialInput {
  readonly title: string;
  readonly attachmentIds: readonly string[];
}

/** A client mistake: the request was understood but its payload is not acceptable. */
export class ProjectMaterialValidationError extends Error {
  public readonly code: 'TITLE_REQUIRED' | 'TITLE_TOO_LONG';

  public constructor(
    code: 'TITLE_REQUIRED' | 'TITLE_TOO_LONG',
    message: string,
  ) {
    super(message);
    this.name = 'ProjectMaterialValidationError';
    this.code = code;
  }
}

export const projectMaterialServiceToken =
  createServiceToken<ProjectMaterialService>('app/project-material-service');

const MATERIALS = 'projectMaterials';
const ATTACHMENTS = 'projectMaterialAttachments';
const TITLE_MAX_LENGTH = 255;

/**
 * The domain half of the Project Materials feature. It knows the two
 * Collections and the ownership rule, and nothing about HTTP: the routes own
 * authentication and status codes, this service owns the data.
 *
 * Every read and write is scoped by `createdById`, so a request can only ever
 * see or change the rows its own principal created. A linked attachment is
 * only accepted when the same principal uploaded it.
 */
export class ProjectMaterialService {
  public constructor(private readonly database: DatabaseManager) {}

  /** Every material owned by `userId`, most recently updated first, with its attachments. */
  public async listOwn(userId: string): Promise<ProjectMaterial[]> {
    const materials = await this.database
      .repository<ProjectMaterialRecord>(MATERIALS)
      .findMany({
        filter: (filter) => filter.string('createdById').eq(userId),
        sort: (sort) => sort.field('updatedAt').desc(),
      });

    return this.withAttachments(materials);
  }

  /** One material owned by `userId`, or null when it does not exist or belongs to somebody else. */
  public async getOwn(
    userId: string,
    materialId: string,
  ): Promise<ProjectMaterial | null> {
    const material = await this.database
      .repository<ProjectMaterialRecord>(MATERIALS)
      .findOne({
        filter: (filter) =>
          filter.and([
            filter.string('id').eq(materialId),
            filter.string('createdById').eq(userId),
          ]),
      });

    if (!material) {
      return null;
    }

    const [result] = await this.withAttachments([material]);
    return result ?? null;
  }

  /** Create a material and link the owned, unlinked attachments the request listed. */
  public async create(
    userId: string,
    input: ProjectMaterialInput,
  ): Promise<ProjectMaterial> {
    const title = this.normalizeTitle(input.title);
    const id = randomUUID();
    const now = new Date().toISOString();

    await this.database.transaction(async (connection) => {
      await connection.repository<ProjectMaterialRecord>(MATERIALS).createOne({
        values: {
          id,
          title,
          createdById: userId,
          createdAt: now,
          updatedAt: now,
        },
      });
      await this.syncAttachments(
        connection,
        userId,
        id,
        input.attachmentIds,
        now,
      );
    });

    const created = await this.getOwn(userId, id);
    if (!created) {
      // Only reachable if the transaction committed a row this same principal cannot read.
      throw new Error('The created material could not be read back.');
    }
    return created;
  }

  /**
   * Update the title and reconcile the attachment set: listed owned attachments
   * are linked, and attachments no longer listed are unlinked. An unlinked
   * attachment is no longer part of the material; it is not destroyed.
   */
  public async update(
    userId: string,
    materialId: string,
    input: ProjectMaterialInput,
  ): Promise<ProjectMaterial | null> {
    const title = this.normalizeTitle(input.title);
    const now = new Date().toISOString();

    const updated = await this.database.transaction(async (connection) => {
      const materials = connection.repository<ProjectMaterialRecord>(MATERIALS);
      const existing = await materials.findOne({
        filter: (filter) =>
          filter.and([
            filter.string('id').eq(materialId),
            filter.string('createdById').eq(userId),
          ]),
      });
      if (!existing) {
        return false;
      }

      await materials.updateOne({
        filter: (filter) => filter.string('id').eq(materialId),
        values: { title, updatedAt: now },
      });
      await this.syncAttachments(
        connection,
        userId,
        materialId,
        input.attachmentIds,
        now,
      );
      return true;
    });

    return updated ? this.getOwn(userId, materialId) : null;
  }

  /**
   * An attachment the caller may read: one they uploaded, whether or not it is
   * already part of a saved material. Nothing else grants access, so a link to
   * somebody else's file is indistinguishable from a missing one.
   */
  public async findOwnedAttachment(
    userId: string,
    attachmentId: string,
  ): Promise<ProjectMaterialAttachmentRecord | null> {
    const attachment = await this.database
      .repository<ProjectMaterialAttachmentRecord>(ATTACHMENTS)
      .findOne({ filter: (filter) => filter.string('id').eq(attachmentId) });

    return attachment && attachment.createdById === userId ? attachment : null;
  }

  /** Attach each material's rows, fetched in one query. */
  private async withAttachments(
    materials: readonly ProjectMaterialRecord[],
  ): Promise<ProjectMaterial[]> {
    if (materials.length === 0) {
      return [];
    }

    const materialIds = materials.map((material) => material.id);
    const attachments = await this.database
      .repository<ProjectMaterialAttachmentRecord>(ATTACHMENTS)
      .findMany({
        filter: (filter) =>
          filter.or(
            materialIds.map((materialId) =>
              filter.string('materialId').eq(materialId),
            ),
          ),
        sort: (sort) => sort.field('createdAt').asc(),
      });

    const byMaterial = new Map<string, ProjectMaterialAttachmentRecord[]>();
    for (const attachment of attachments) {
      if (attachment.materialId === null) {
        continue;
      }
      const bucket = byMaterial.get(attachment.materialId) ?? [];
      bucket.push(attachment);
      byMaterial.set(attachment.materialId, bucket);
    }

    return materials.map((material) => ({
      ...material,
      attachments: byMaterial.get(material.id) ?? [],
    }));
  }

  /**
   * Reconcile the attachments linked to one material. Runs inside the caller's
   * transaction, so a failure leaves both tables as they were.
   */
  private async syncAttachments(
    connection: DatabaseConnection,
    userId: string,
    materialId: string,
    attachmentIds: readonly string[],
    now: string,
  ): Promise<void> {
    const attachments =
      connection.repository<ProjectMaterialAttachmentRecord>(ATTACHMENTS);
    const desired = new Set(attachmentIds);

    const current = await attachments.findMany({
      filter: (filter) => filter.string('materialId').eq(materialId),
    });
    for (const attachment of current) {
      if (desired.has(attachment.id)) {
        continue;
      }
      await attachments.updateOne({
        filter: (filter) => filter.string('id').eq(attachment.id),
        values: { materialId: null, updatedAt: now },
      });
    }

    for (const attachmentId of attachmentIds) {
      const attachment = await attachments.findOne({
        filter: (filter) => filter.string('id').eq(attachmentId),
      });
      // Only an attachment this principal uploaded may be linked. An id that is
      // missing, somebody else's, already part of this material, or already
      // part of another one is skipped rather than failing the save: the
      // response reports the set that actually resulted.
      if (
        !attachment ||
        attachment.createdById !== userId ||
        attachment.materialId !== null
      ) {
        continue;
      }
      await attachments.updateOne({
        filter: (filter) => filter.string('id').eq(attachment.id),
        values: { materialId, updatedAt: now },
      });
    }
  }

  private normalizeTitle(input: string): string {
    const title = input.trim();
    if (!title) {
      throw new ProjectMaterialValidationError(
        'TITLE_REQUIRED',
        'A material title is required.',
      );
    }
    if (title.length > TITLE_MAX_LENGTH) {
      throw new ProjectMaterialValidationError(
        'TITLE_TOO_LONG',
        `A material title may not exceed ${TITLE_MAX_LENGTH} characters.`,
      );
    }
    return title;
  }
}

/**
 * Registers the service and binds the existing database token into it. Binding
 * here rather than each route means one place resolves how the service reaches
 * the database.
 */
export class ProjectMaterialServiceProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/project-material-provider';

  public override register(): void {
    const database = this.app.container.resolve(databaseManagerToken);
    this.app.container.instance(
      projectMaterialServiceToken,
      new ProjectMaterialService(database),
    );
  }
}

export default ProjectMaterialServiceProvider;
