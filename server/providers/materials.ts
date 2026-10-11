import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

/** The columns of a `material_files` row this application reads. */
export interface MaterialFileRecord {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A material with the files currently attached to it. */
export interface MaterialRecord {
  readonly id: number;
  readonly title: string;
  readonly ownerId: string;
  readonly files: readonly MaterialFileRecord[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The `materials` columns this application reads and writes. */
interface MaterialRow {
  readonly id: number;
  readonly title: string;
  readonly ownerId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The `material_files` columns this application reads and writes. */
interface MaterialFileRow {
  readonly id: string;
  readonly filename: string;
  readonly ext: string | null;
  readonly mimeType: string | null;
  readonly size: number;
  readonly ownerId: string;
  readonly materialId: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type MaterialsErrorCode =
  'MATERIAL_NOT_FOUND' | 'INVALID_TITLE' | 'FILE_NOT_OWNED';

/** A domain failure a route turns into the matching HTTP error. */
export class MaterialsError extends Error {
  constructor(
    readonly code: MaterialsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MaterialsError';
  }
}

export const materialsServiceToken = createServiceToken<MaterialsService>(
  '@nocobase/app/materials',
);

/**
 * Materials and their private attachments.
 *
 * Every read and write is scoped to the signed-in owner: a material is only visible to the user who created it, and a
 * file may only be attached by the user who uploaded it. A file that is not owned by the caller is refused rather than
 * silently skipped, so a wrong or tampered file id cannot attach somebody else's content.
 */
export class MaterialsService {
  constructor(private readonly database: DatabaseManager) {}

  private get materialRepository() {
    return this.database.repository<MaterialRow>('materials');
  }

  private get materialFileRepository() {
    return this.database.repository<MaterialFileRow>('material_files');
  }

  async list(ownerId: string): Promise<MaterialRecord[]> {
    const materials = await this.materialRepository.findMany({
      filter: { ownerId },
      sort: (sort) => sort.field('id').desc(),
    });
    const files = await this.materialFileRepository.findMany({
      filter: { ownerId },
      sort: (sort) => sort.field('createdAt').asc(),
    });

    const byMaterial = new Map<number, MaterialFileRecord[]>();
    for (const file of files) {
      if (file.materialId === null || file.materialId === undefined) continue;
      const key = Number(file.materialId);
      const bucket = byMaterial.get(key) ?? [];
      bucket.push(toFileRecord(file));
      byMaterial.set(key, bucket);
    }

    return materials.map((material) =>
      toMaterialRecord(material, byMaterial.get(Number(material.id)) ?? []),
    );
  }

  async get(ownerId: string, id: number): Promise<MaterialRecord> {
    const material = await this.requireMaterial(ownerId, id);
    const files = await this.materialFileRepository.findMany({
      filter: { ownerId, materialId: id },
      sort: (sort) => sort.field('createdAt').asc(),
    });
    return toMaterialRecord(material, files.map(toFileRecord));
  }

  async create(
    ownerId: string,
    input: { title: string; fileIds: readonly string[] },
  ): Promise<MaterialRecord> {
    const title = requireTitle(input.title);
    await this.assertFilesOwned(ownerId, input.fileIds);
    const now = new Date().toISOString();

    const { record } = await this.materialRepository.createOne({
      values: { title, ownerId, createdAt: now, updatedAt: now },
    });
    const id = Number(record.id);
    await this.attach(ownerId, id, input.fileIds, now);
    return this.get(ownerId, id);
  }

  async update(
    ownerId: string,
    id: number,
    input: { title: string; fileIds: readonly string[] },
  ): Promise<MaterialRecord> {
    const title = requireTitle(input.title);
    await this.requireMaterial(ownerId, id);
    await this.assertFilesOwned(ownerId, input.fileIds);
    const now = new Date().toISOString();

    const keep = new Set(input.fileIds);
    const attached = await this.materialFileRepository.findMany({
      filter: { ownerId, materialId: id },
    });
    for (const file of attached) {
      if (keep.has(file.id)) continue;
      await this.materialFileRepository.updateOne({
        filter: { id: file.id },
        values: { materialId: null, updatedAt: now },
      });
    }

    await this.materialRepository.updateOne({
      filter: { id },
      values: { title, updatedAt: now },
    });
    await this.attach(ownerId, id, input.fileIds, now);
    return this.get(ownerId, id);
  }

  async remove(ownerId: string, id: number): Promise<void> {
    await this.requireMaterial(ownerId, id);
    const now = new Date().toISOString();
    await this.materialFileRepository.updateMany({
      filter: { ownerId, materialId: id },
      values: { materialId: null, updatedAt: now },
    });
    await this.materialRepository.deleteOne({ filter: { id } });
  }

  private async attach(
    ownerId: string,
    id: number,
    fileIds: readonly string[],
    now: string,
  ): Promise<void> {
    for (const fileId of fileIds) {
      await this.materialFileRepository.updateOne({
        filter: { id: fileId, ownerId },
        values: { materialId: id, updatedAt: now },
      });
    }
  }

  private async requireMaterial(
    ownerId: string,
    id: number,
  ): Promise<MaterialRow> {
    const material = await this.materialRepository.findOne({
      filter: { id, ownerId },
    });
    if (!material) {
      throw new MaterialsError(
        'MATERIAL_NOT_FOUND',
        `Material ${id} was not found.`,
      );
    }
    return material;
  }

  private async assertFilesOwned(
    ownerId: string,
    fileIds: readonly string[],
  ): Promise<void> {
    const unique = [...new Set(fileIds)];
    for (const fileId of unique) {
      const file = await this.materialFileRepository.findOne({
        filter: { id: fileId, ownerId },
      });
      if (!file) {
        throw new MaterialsError(
          'FILE_NOT_OWNED',
          `File ${fileId} does not belong to the caller.`,
        );
      }
    }
  }
}

export class MaterialsProvider extends ServiceProvider<Application> {
  readonly name = '@nocobase/app/materials';

  register(): void {
    this.app.container.singleton(
      materialsServiceToken,
      (container) =>
        new MaterialsService(container.resolve(databaseManagerToken)),
    );
  }
}

function requireTitle(value: string): string {
  const title = value.trim();
  if (!title) {
    throw new MaterialsError('INVALID_TITLE', 'A title is required.');
  }
  return title;
}

function toMaterialRecord(
  material: MaterialRow,
  files: readonly MaterialFileRecord[],
): MaterialRecord {
  return {
    id: material.id,
    title: material.title,
    ownerId: material.ownerId,
    files,
    createdAt: material.createdAt,
    updatedAt: material.updatedAt,
  };
}

function toFileRecord(file: MaterialFileRow): MaterialFileRecord {
  return {
    id: file.id,
    filename: file.filename,
    ext: file.ext ?? '',
    mimeType: file.mimeType ?? '',
    size: Number(file.size),
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}
