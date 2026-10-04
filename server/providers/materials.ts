import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';
import { randomUUID } from 'node:crypto';

/**
 * Project materials and their private attachments.
 *
 * A material has a required title and an owner; its attachments are files that
 * already exist in `material_files` (uploaded through the File Repository's
 * `uploadOne` action) and have been linked to it. Linking and unlinking is this
 * service's job, so the HTTP layer never writes an attachment row itself.
 *
 * Every read and write is scoped by `ownerId`, which is the isolation boundary
 * the product requires: a colleague holding a direct link gets a 404, not
 * another person's record. The service returns domain values only; it does not
 * know about HTTP status codes, and the routes translate its errors.
 */

/** The extensions the materials feature accepts. Anything else is rejected before it can be linked. */
export const MATERIAL_ATTACHMENT_EXTENSIONS: readonly string[] = [
  'png',
  'docx',
];

export type MaterialsErrorCode =
  | 'TITLE_REQUIRED'
  | 'TITLE_TOO_LONG'
  | 'ATTACHMENT_NOT_FOUND'
  | 'ATTACHMENT_TYPE_NOT_ALLOWED';

export class MaterialsError extends Error {
  public readonly code: MaterialsErrorCode;

  public constructor(code: MaterialsErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'MaterialsError';
  }
}

export interface MaterialRecord {
  readonly id: string;
  readonly title: string;
  readonly ownerId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MaterialAttachmentRecord {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number | string;
  readonly ownerId: string;
  readonly materialId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MaterialWithAttachments extends MaterialRecord {
  readonly attachments: readonly MaterialAttachmentRecord[];
}

export interface MaterialInput {
  readonly title: string;
  readonly attachmentIds: readonly string[];
}

export const materialsToken = createServiceToken<MaterialsService>('materials');

const MAX_TITLE_LENGTH = 255;

export class MaterialsService {
  private readonly database: DatabaseManager;

  public constructor(database: DatabaseManager) {
    this.database = database;
  }

  private get materials(): Repository<MaterialRecord> {
    return this.database.repository<MaterialRecord>('materials');
  }

  private get attachments(): Repository<MaterialAttachmentRecord> {
    return this.database.repository<MaterialAttachmentRecord>('material_files');
  }

  public async listOwned(ownerId: string): Promise<MaterialWithAttachments[]> {
    const materials = await this.materials.findMany({
      filter: { ownerId },
      sort: (sort) => sort.field('createdAt').desc(),
    });
    if (!materials.length) return [];

    const materialIds = new Set(materials.map((material) => material.id));
    const attachments = await this.attachments.findMany({
      filter: { ownerId },
      sort: (sort) => sort.field('createdAt').asc(),
    });
    const byMaterial = new Map<string, MaterialAttachmentRecord[]>();
    for (const attachment of attachments) {
      if (attachment.materialId === null) continue;
      if (!materialIds.has(attachment.materialId)) continue;
      const bucket = byMaterial.get(attachment.materialId) ?? [];
      bucket.push(attachment);
      byMaterial.set(attachment.materialId, bucket);
    }

    return materials.map((material) => ({
      ...material,
      attachments: byMaterial.get(material.id) ?? [],
    }));
  }

  public async getOwned(
    ownerId: string,
    id: string,
  ): Promise<MaterialWithAttachments | undefined> {
    const material = await this.materials.findOne({
      filter: { id, ownerId },
    });
    if (!material) return undefined;

    const attachments = await this.attachments.findMany({
      filter: { ownerId, materialId: id },
      sort: (sort) => sort.field('createdAt').asc(),
    });
    return { ...material, attachments };
  }

  /** Every attachment the caller uploaded, linked or not. Used by the file resource's own read alias. */
  public async listAttachmentsOwned(
    ownerId: string,
  ): Promise<MaterialAttachmentRecord[]> {
    return this.attachments.findMany({
      filter: { ownerId },
      sort: (sort) => sort.field('createdAt').asc(),
    });
  }

  public async createOwned(
    ownerId: string,
    input: MaterialInput,
  ): Promise<MaterialWithAttachments> {
    const title = this.normalizeTitle(input.title);
    const attachmentIds = await this.resolveAttachmentIds(
      ownerId,
      input.attachmentIds,
    );
    const now = new Date().toISOString();

    const created = await this.materials.createOne({
      values: {
        // The Collection declares a uuid primary key but no database default, so the row's identity is
        // application-owned — the same way the File Repository's upload path mints its own file ids.
        id: randomUUID(),
        title,
        ownerId,
        createdAt: now,
        updatedAt: now,
      },
    });
    const id = created.record.id;
    await this.syncAttachments(ownerId, id, attachmentIds, now);

    const material = await this.getOwned(ownerId, id);
    if (!material) {
      throw new MaterialsError(
        'ATTACHMENT_NOT_FOUND',
        'The material could not be read back after it was created.',
      );
    }
    return material;
  }

  public async updateOwned(
    ownerId: string,
    id: string,
    input: MaterialInput,
  ): Promise<MaterialWithAttachments | undefined> {
    const existing = await this.materials.findOne({ filter: { id, ownerId } });
    if (!existing) return undefined;

    const title = this.normalizeTitle(input.title);
    const attachmentIds = await this.resolveAttachmentIds(
      ownerId,
      input.attachmentIds,
    );
    const now = new Date().toISOString();

    await this.materials.updateOne({
      filter: { id, ownerId },
      values: { title, updatedAt: now },
    });
    await this.syncAttachments(ownerId, id, attachmentIds, now);
    return this.getOwned(ownerId, id);
  }

  public async deleteOwned(ownerId: string, id: string): Promise<boolean> {
    const existing = await this.materials.findOne({ filter: { id, ownerId } });
    if (!existing) return false;

    const now = new Date().toISOString();
    await this.attachments.updateMany({
      filter: { ownerId, materialId: id },
      values: { materialId: null, updatedAt: now },
    });
    await this.materials.deleteOne({ filter: { id, ownerId } });
    return true;
  }

  /** An attachment the caller may link: it exists, belongs to them, and is one of the accepted types. */
  private async resolveAttachmentIds(
    ownerId: string,
    attachmentIds: readonly string[],
  ): Promise<string[]> {
    const unique = [...new Set(attachmentIds.filter(Boolean))];
    if (!unique.length) return [];

    const found = await this.attachments.findMany({
      filter: (filter) =>
        filter.and([
          filter.string('ownerId').eq(ownerId),
          filter.or(unique.map((id) => filter.string('id').eq(id))),
        ]),
    });
    if (found.length !== unique.length) {
      throw new MaterialsError(
        'ATTACHMENT_NOT_FOUND',
        'One of the selected attachments is missing or belongs to someone else.',
      );
    }
    for (const attachment of found) {
      if (!MATERIAL_ATTACHMENT_EXTENSIONS.includes(attachment.ext)) {
        throw new MaterialsError(
          'ATTACHMENT_TYPE_NOT_ALLOWED',
          `Only ${MATERIAL_ATTACHMENT_EXTENSIONS.join(', ')} attachments are allowed.`,
        );
      }
    }
    return unique;
  }

  /** Links the requested attachments, unlinks the ones that were removed, and touches nothing else. */
  private async syncAttachments(
    ownerId: string,
    materialId: string,
    attachmentIds: readonly string[],
    now: string,
  ): Promise<void> {
    const current = await this.attachments.findMany({
      filter: { ownerId, materialId },
    });
    const currentIds = new Set(current.map((attachment) => attachment.id));
    const targetIds = new Set(attachmentIds);

    for (const attachment of current) {
      if (targetIds.has(attachment.id)) continue;
      await this.attachments.updateOne({
        filter: { id: attachment.id, ownerId },
        values: { materialId: null, updatedAt: now },
      });
    }
    for (const id of targetIds) {
      if (currentIds.has(id)) continue;
      await this.attachments.updateOne({
        filter: { id, ownerId },
        values: { materialId, updatedAt: now },
      });
    }
  }

  private normalizeTitle(value: string): string {
    const title = typeof value === 'string' ? value.trim() : '';
    if (!title) {
      throw new MaterialsError(
        'TITLE_REQUIRED',
        'A material title is required.',
      );
    }
    if (title.length > MAX_TITLE_LENGTH) {
      throw new MaterialsError(
        'TITLE_TOO_LONG',
        `A material title may be at most ${MAX_TITLE_LENGTH} characters.`,
      );
    }
    return title;
  }
}

export class MaterialsProvider extends ServiceProvider<Application> {
  public readonly name: string = 'materials';

  public override register(): void {
    this.app.container.singleton(
      materialsToken,
      (container) =>
        new MaterialsService(container.resolve(databaseManagerToken)),
    );
  }
}
