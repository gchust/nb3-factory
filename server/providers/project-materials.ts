import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

/**
 * The application's own project-materials domain.
 *
 * A material is a title plus a set of uploaded files. The files themselves live
 * in the `projectMaterialFiles` Collection that the File plugin's upload path
 * writes into; this service owns the parts the plugin deliberately leaves to the
 * application: scoping both collections to the authenticated owner, linking
 * uploaded files to a material, and detaching them again. Every method takes the
 * caller's `ownerId` and never trusts an id from the request body, so one user's
 * material and its attachments are unreachable from another's session.
 */

/** Where the File plugin's app-owned exposure serves the bytes of an uploaded file. */
export const PROJECT_MATERIAL_FILES_ACCESS_PATH = '/projectMaterialFiles';

/** The most attachments one material may carry in a single write. */
export const PROJECT_MATERIAL_FILES_MAX = 50;

/** One attachment, in the shape the File plugin's client components consume. */
export interface ProjectMaterialFileView {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: string | number;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** The app-owned URL that serves the bytes; the caller's session is checked there again. */
  readonly contentUrl: string;
}

export interface ProjectMaterialView {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly files: readonly ProjectMaterialFileView[];
}

export interface ProjectMaterialListPage {
  readonly items: readonly ProjectMaterialView[];
  readonly total: number;
}

export interface ProjectMaterialListOptions {
  readonly page: number;
  readonly pageSize: number;
}

export interface ProjectMaterialCreateInput {
  readonly title: string;
  readonly fileIds?: readonly string[];
}

export interface ProjectMaterialUpdateInput {
  readonly title?: string;
  readonly fileIds?: readonly string[];
}

/** Why a write was refused before it reached the database. */
export type ProjectMaterialErrorCode = 'INVALID_FILE_IDS';

export class ProjectMaterialError extends Error {
  readonly code: ProjectMaterialErrorCode;
  readonly field: string;

  constructor(code: ProjectMaterialErrorCode, field: string, message: string) {
    super(message);
    this.code = code;
    this.field = field;
    this.name = 'ProjectMaterialError';
  }
}

interface ProjectMaterialRecord {
  id: number;
  title: string;
  ownerId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface ProjectMaterialFileRecord {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number | bigint | string;
  ownerId: string;
  materialId: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** The link a file has to one material, as the content route needs it. */
export interface ProjectMaterialFileOwner {
  readonly ownerId: string;
}

export const projectMaterialsServiceToken =
  createServiceToken<ProjectMaterialsService>('projectMaterials');

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export class ProjectMaterialsService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly publicBasePath: string,
  ) {}

  private materials(): Repository<ProjectMaterialRecord> {
    return this.database.repository<ProjectMaterialRecord>('projectMaterials');
  }

  private files(): Repository<ProjectMaterialFileRecord> {
    return this.database.repository<ProjectMaterialFileRecord>(
      'projectMaterialFiles',
    );
  }

  /**
   * One page of this owner's materials, most recently updated first, with the
   * attachments of each material on the page.
   */
  async list(
    ownerId: string,
    options: ProjectMaterialListOptions,
  ): Promise<ProjectMaterialListPage> {
    const total = await this.materials().count({ filter: { ownerId } });
    const materials = await this.materials().findMany({
      filter: { ownerId },
      sort: (sort) => sort.field('updatedAt').desc(),
      limit: options.pageSize,
      offset: (options.page - 1) * options.pageSize,
    });
    if (!materials.length) return { items: [], total };
    // One read for every file this owner owns, grouped in memory: the filter
    // builder has no `IN` operator, and an owner's files are bounded by their
    // own uploads.
    const files = await this.files().findMany({
      filter: { ownerId },
      sort: (sort) => sort.field('createdAt').asc(),
    });
    const byMaterial = new Map<number, ProjectMaterialFileRecord[]>();
    for (const file of files) {
      if (file.materialId === null || file.materialId === undefined) continue;
      const materialId = Number(file.materialId);
      const attached = byMaterial.get(materialId);
      if (attached) attached.push(file);
      else byMaterial.set(materialId, [file]);
    }
    return {
      total,
      items: materials.map((material) =>
        this.toView(material, byMaterial.get(Number(material.id)) ?? []),
      ),
    };
  }

  /** One material, or `undefined` when it does not exist or belongs to someone else. */
  async get(
    ownerId: string,
    materialId: number,
  ): Promise<ProjectMaterialView | undefined> {
    const material = await this.materials().findOne({
      filter: { id: materialId, ownerId },
    });
    if (!material) return undefined;
    return this.toView(material, await this.attachedFiles(ownerId, materialId));
  }

  async create(
    ownerId: string,
    input: ProjectMaterialCreateInput,
  ): Promise<ProjectMaterialView> {
    const now = new Date();
    const { record } = await this.materials().createOne({
      values: {
        title: input.title,
        ownerId,
        createdAt: now,
        updatedAt: now,
      },
    });
    const materialId = Number(record.id);
    if (input.fileIds?.length) {
      await this.syncFiles(ownerId, materialId, input.fileIds);
    }
    const created = await this.get(ownerId, materialId);
    if (!created)
      throw new Error('The created material could not be read back.');
    return created;
  }

  /** `undefined` when the material does not exist or belongs to someone else. */
  async update(
    ownerId: string,
    materialId: number,
    input: ProjectMaterialUpdateInput,
  ): Promise<ProjectMaterialView | undefined> {
    const existing = await this.materials().findOne({
      filter: { id: materialId, ownerId },
    });
    if (!existing) return undefined;
    if (input.title !== undefined || input.fileIds !== undefined) {
      await this.materials().updateOne({
        filter: { id: materialId, ownerId },
        values: {
          ...(input.title === undefined ? {} : { title: input.title }),
          updatedAt: new Date(),
        },
      });
    }
    if (input.fileIds !== undefined) {
      await this.syncFiles(ownerId, materialId, input.fileIds);
    }
    return this.get(ownerId, materialId);
  }

  /**
   * Deletes the material and detaches its files. The file records and their
   * stored objects are kept: removing an attachment is a detach, never a
   * permanent delete, so nothing a user uploaded disappears behind their back.
   *
   * `false` when the material does not exist or belongs to someone else.
   */
  async remove(ownerId: string, materialId: number): Promise<boolean> {
    const existing = await this.materials().findOne({
      filter: { id: materialId, ownerId },
    });
    if (!existing) return false;
    await this.detach(ownerId, materialId);
    await this.materials().deleteOne({
      filter: { id: materialId, ownerId },
    });
    return true;
  }

  /** The owner of a file, for the content route's own authorization check. */
  async findFileOwner(
    fileId: string,
  ): Promise<ProjectMaterialFileOwner | undefined> {
    const file = await this.files().findOne({ filter: { id: fileId } });
    return file ? { ownerId: file.ownerId } : undefined;
  }

  private async attachedFiles(
    ownerId: string,
    materialId: number,
  ): Promise<ProjectMaterialFileRecord[]> {
    return await this.files().findMany({
      filter: (filter) =>
        filter.and([
          filter.string('ownerId').eq(ownerId),
          filter.number('materialId').eq(materialId),
        ]),
      sort: (sort) => sort.field('createdAt').asc(),
    });
  }

  /**
   * Makes the material's attachments exactly `fileIds`: files already attached
   * are kept, files no longer named are detached, and newly named files are
   * attached after confirming this owner uploaded them. A file id that is
   * unknown or belongs to someone else is refused as a field violation so the
   * existence of another user's file is never revealed.
   */
  private async syncFiles(
    ownerId: string,
    materialId: number,
    fileIds: readonly string[],
  ): Promise<void> {
    const desired = new Set(fileIds);
    if (desired.size !== fileIds.length) {
      throw new ProjectMaterialError(
        'INVALID_FILE_IDS',
        'fileIds',
        'fileIds contains a duplicate.',
      );
    }
    const attached = await this.attachedFiles(ownerId, materialId);
    const attachedIds = new Set(attached.map((file) => file.id));
    for (const file of attached) {
      if (!desired.has(file.id)) {
        await this.files().updateOne({
          filter: { id: file.id, ownerId },
          values: { materialId: null, updatedAt: new Date() },
        });
      }
    }
    for (const id of desired) {
      if (attachedIds.has(id)) continue;
      const file = await this.files().findOne({ filter: { id, ownerId } });
      // A file already attached elsewhere may not be stolen from that material.
      if (
        !file ||
        (file.materialId !== null && file.materialId !== undefined)
      ) {
        throw new ProjectMaterialError(
          'INVALID_FILE_IDS',
          'fileIds',
          `The file ${id} does not exist or is already attached.`,
        );
      }
      await this.files().updateOne({
        filter: { id, ownerId },
        values: { materialId, updatedAt: new Date() },
      });
    }
  }

  private async detach(ownerId: string, materialId: number): Promise<void> {
    await this.files().updateMany({
      filter: (filter) =>
        filter.and([
          filter.string('ownerId').eq(ownerId),
          filter.number('materialId').eq(materialId),
        ]),
      values: { materialId: null, updatedAt: new Date() },
    });
  }

  private toView(
    material: ProjectMaterialRecord,
    files: readonly ProjectMaterialFileRecord[],
  ): ProjectMaterialView {
    return {
      id: String(material.id),
      title: material.title,
      createdAt: toIso(material.createdAt),
      updatedAt: toIso(material.updatedAt),
      files: files.map((file) => this.toFileView(file)),
    };
  }

  private toFileView(file: ProjectMaterialFileRecord): ProjectMaterialFileView {
    return {
      id: file.id,
      disk: file.disk,
      key: file.key,
      filename: file.filename,
      ext: file.ext,
      mimeType: file.mimeType,
      size: typeof file.size === 'bigint' ? file.size.toString() : file.size,
      createdAt: toIso(file.createdAt),
      updatedAt: toIso(file.updatedAt),
      contentUrl: `${this.publicBasePath.replace(/\/$/u, '')}${PROJECT_MATERIAL_FILES_ACCESS_PATH}/${encodeURIComponent(file.id)}${file.ext ? `.${encodeURIComponent(file.ext)}` : ''}`,
    };
  }
}

export class ProjectMaterialsProvider extends ServiceProvider<Application> {
  readonly name = 'project-materials';

  override register(): void {
    const database = this.app.container.resolve(databaseManagerToken);
    this.app.container.instance(
      projectMaterialsServiceToken,
      new ProjectMaterialsService(database, this.app.publicBasePath),
    );
  }
}
