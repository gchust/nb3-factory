import type { Application } from '@nocobase/app-server/application';
import type {
  ServerFileRepository,
  ServerFileRepositoryManager,
} from '@nocobase/app-plugin-file/server';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import {
  databaseManagerToken,
  type DatabaseManager,
  type RepositoryPolicy,
} from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

/** The disk the materials' attachments live on, from the application's drive configuration. */
const MATERIAL_FILE_DISK = 'local';
/** Where the file plugin serves the attachment bytes; the App guards this path itself. */
export const MATERIAL_FILE_ACCESS_PATH = '/uploads/projectMaterialFiles';
/** The logical Collection that stores the attachments. */
export const MATERIAL_FILE_COLLECTION = 'projectMaterialFiles';
/** The logical Collection that stores the materials. */
export const MATERIAL_COLLECTION = 'projectMaterials';

/**
 * The service reads and writes files directly, on behalf of an already-authenticated caller whose
 * ownership it enforces in every filter. It never uploads through this Repository, so the Policy
 * here only has to leave no authority standing: the upload path binds its own Policy derived from
 * the exposure's.
 */
const directAccessPolicy: RepositoryPolicy = {
  read: false,
  create: false,
  update: false,
  delete: false,
};

export interface ProjectMaterialFileDto {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly contentUrl: string;
}

export interface ProjectMaterialDto {
  readonly id: number;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly files: readonly ProjectMaterialFileDto[];
}

export interface ProjectMaterialInput {
  readonly title: string;
  readonly fileIds?: readonly string[];
}

interface ProjectMaterialRow {
  readonly id: number;
  readonly title: string;
  readonly ownerId: string;
  readonly createdAt: unknown;
  readonly updatedAt: unknown;
}

/** What a file read offers a response; narrower than the plugin's `FileRecord`. */
interface MaterialFileRow {
  readonly id: string;
  readonly ownerId: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: string | number;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
  readonly materialId?: number | null;
}

/** A stored datetime reaches the query adapter as a Date or an already-encoded string. */
function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value).toISOString();
  return '';
}

/**
 * Project materials and their private attachments.
 *
 * Every read and write is filtered by the owner, which is what keeps one user's materials and
 * files out of another's responses: the browser never supplies ownership, so no query accepts it.
 */
export class ProjectMaterialsService {
  private fileRepositoryValue: ServerFileRepository | null = null;

  constructor(
    private readonly database: DatabaseManager,
    private readonly files: ServerFileRepositoryManager,
    private readonly publicBasePath: string | undefined,
  ) {}

  async list(ownerId: string): Promise<ProjectMaterialDto[]> {
    const materials = await this.materials().findMany({
      filter: { ownerId },
      sort: (sort) => sort.field('id').desc(),
      limit: 200,
    });
    const files = await this.ownedFiles(ownerId);
    const grouped = new Map<number, ProjectMaterialFileDto[]>();
    for (const file of files) {
      if (typeof file.materialId !== 'number') continue;
      const list = grouped.get(file.materialId) ?? [];
      list.push(this.toFileDto(file));
      grouped.set(file.materialId, list);
    }
    return materials.map((material) =>
      this.toMaterialDto(material, grouped.get(material.id) ?? []),
    );
  }

  async get(
    ownerId: string,
    id: number,
  ): Promise<ProjectMaterialDto | undefined> {
    const material = await this.materials().findOne({
      filter: { id, ownerId },
    });
    if (!material) return undefined;
    const files = await this.ownedFiles(ownerId);
    return this.toMaterialDto(
      material,
      files
        .filter((file) => file.materialId === id)
        .map((file) => this.toFileDto(file)),
    );
  }

  async create(
    ownerId: string,
    input: ProjectMaterialInput,
  ): Promise<ProjectMaterialDto> {
    const fileIds = [...new Set(input.fileIds ?? [])];
    await this.assertFilesOwned(ownerId, fileIds);

    const now = new Date();
    const created = await this.materials().createOne({
      values: {
        title: input.title,
        ownerId,
        createdAt: now,
        updatedAt: now,
      },
    });
    const id = created.record.id;
    await this.attach(ownerId, id, fileIds);
    const material = await this.get(ownerId, id);
    if (!material)
      throw new Error('The material disappeared right after it was created.');
    return material;
  }

  async update(
    ownerId: string,
    id: number,
    input: { readonly title?: string; readonly fileIds?: readonly string[] },
  ): Promise<ProjectMaterialDto | undefined> {
    const existing = await this.materials().findOne({
      filter: { id, ownerId },
    });
    if (!existing) return undefined;

    const values: { updatedAt: Date; title?: string } = {
      updatedAt: new Date(),
    };
    if (input.title !== undefined) values.title = input.title;
    await this.materials().updateOne({ filter: { id, ownerId }, values });

    if (input.fileIds !== undefined) {
      const fileIds = [...new Set(input.fileIds)];
      await this.assertFilesOwned(ownerId, fileIds);
      await this.detachMissing(ownerId, id, fileIds);
      await this.attach(ownerId, id, fileIds);
    }
    return this.get(ownerId, id);
  }

  private materials() {
    return this.database.repository<ProjectMaterialRow>(MATERIAL_COLLECTION);
  }

  /** The plugin's server-side file Repository, used for the exposure's URL semantics only. Its
   * Policy is inert here because reads and links go through the database repository directly. */
  private fileRepository(): ServerFileRepository {
    this.fileRepositoryValue ??= this.files.repository(
      MATERIAL_FILE_COLLECTION,
      {
        disk: MATERIAL_FILE_DISK,
        accessPath: MATERIAL_FILE_ACCESS_PATH,
        policy: directAccessPolicy,
      },
    );
    return this.fileRepositoryValue;
  }

  /** Files are read and linked directly, so the ownership filter is written once, here, for both. */
  private fileRecords() {
    return this.database.repository<MaterialFileRow>(MATERIAL_FILE_COLLECTION);
  }

  private async ownedFiles(ownerId: string): Promise<MaterialFileRow[]> {
    return this.fileRecords().findMany({
      filter: { ownerId },
      sort: (sort) => sort.field('id').asc(),
      limit: 1000,
    });
  }

  /** Ownership is checked before anything is written, so a foreign id fails before a mutation. */
  private async assertFilesOwned(
    ownerId: string,
    fileIds: readonly string[],
  ): Promise<void> {
    if (!fileIds.length) return;
    const owned = new Set((await this.ownedFiles(ownerId)).map((f) => f.id));
    const foreign = fileIds.filter((fileId) => !owned.has(fileId));
    if (foreign.length) {
      throw new MaterialFileOwnershipError(foreign);
    }
  }

  private async attach(
    ownerId: string,
    materialId: number,
    fileIds: readonly string[],
  ): Promise<void> {
    for (const fileId of fileIds) {
      await this.fileRecords().updateOne({
        filter: { id: fileId, ownerId },
        values: { materialId },
      });
    }
  }

  /** A file removed from the form is detached, not deleted: its bytes stay until it is deleted. */
  private async detachMissing(
    ownerId: string,
    materialId: number,
    keep: readonly string[],
  ): Promise<void> {
    const kept = new Set(keep);
    const linked = (await this.ownedFiles(ownerId)).filter(
      (file) => file.materialId === materialId && !kept.has(file.id),
    );
    for (const file of linked) {
      await this.fileRecords().updateOne({
        filter: { id: file.id, ownerId },
        values: { materialId: null },
      });
    }
  }

  private toFileDto(record: MaterialFileRow): ProjectMaterialFileDto {
    const base = (this.publicBasePath ?? '').replace(/\/$/, '');
    return {
      id: record.id,
      disk: record.disk,
      key: record.key,
      filename: record.filename,
      ext: record.ext,
      mimeType: record.mimeType,
      size: Number(record.size),
      createdAt: toIso(record.createdAt),
      updatedAt: toIso(record.updatedAt),
      contentUrl: `${base}${this.fileRepository().getUrl(record)}`,
    };
  }

  private toMaterialDto(
    material: ProjectMaterialRow,
    files: readonly ProjectMaterialFileDto[],
  ): ProjectMaterialDto {
    return {
      id: material.id,
      title: material.title,
      createdAt: toIso(material.createdAt),
      updatedAt: toIso(material.updatedAt),
      files: [...files],
    };
  }
}

/** Raised when a caller submits a file id that belongs to somebody else. */
export class MaterialFileOwnershipError extends Error {
  constructor(readonly fileIds: readonly string[]) {
    super('One or more attachments do not belong to the current user.');
    this.name = 'MaterialFileOwnershipError';
  }
}

export const projectMaterialsServiceToken =
  createServiceToken<ProjectMaterialsService>('projectMaterialsService');

export class ProjectMaterialsProvider extends ServiceProvider<Application> {
  readonly name = 'project-materials';

  register(): void {
    this.app.container.singleton(
      projectMaterialsServiceToken,
      (container) =>
        new ProjectMaterialsService(
          container.resolve(databaseManagerToken),
          container.resolve(serverFileRepositoryManagerToken),
          this.app.publicBasePath,
        ),
    );
  }
}
