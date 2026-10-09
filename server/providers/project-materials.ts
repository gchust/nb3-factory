import { randomUUID } from 'node:crypto';

import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

// The path the file plugin's public byte route is mounted at. It is fixed here because this application owns the
// exposure: the service builds the same `contentUrl` the plugin's API responses carry and the content guard matches
// it, so both sides agree on one literal instead of repeating a string.
export const PROJECT_MATERIAL_FILES_ACCESS_PATH =
  '/uploads/project-material-files';

// The exposure name the generated file endpoints answer at (`/api/projectMaterialFiles/...`).
export const PROJECT_MATERIAL_FILES_EXPOSURE = 'projectMaterialFiles';

// The only formats this first version accepts. The client's picker and the server-side check both read this list.
export const PROJECT_MATERIAL_ATTACHMENT_EXTENSIONS = ['png', 'docx'] as const;

export interface ProjectMaterialFileView {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Absolute-from-origin, already carrying the application base path, so it is usable in an `img`/`a` directly. */
  readonly contentUrl: string;
}

export interface ProjectMaterialView {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly files: readonly ProjectMaterialFileView[];
}

export interface ProjectMaterialCreateInput {
  readonly title: string;
  readonly description?: string | null;
  readonly fileIds?: readonly string[];
}

export interface ProjectMaterialUpdateInput {
  readonly title?: string;
  readonly description?: string | null;
  /**
   * The complete set of files this material should end up with. Files linked to the material but absent here are
   * detached (their `materialId` is cleared); they are never deleted. Omit the field to leave the set unchanged.
   */
  readonly fileIds?: readonly string[];
}

export interface MaterialRow {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly createdById: string;
  readonly createdAt: unknown;
  readonly updatedAt: unknown;
}

export interface MaterialFileRow {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number | bigint | string;
  readonly materialId: string | null;
  readonly createdById: string;
  readonly createdAt: unknown;
  readonly updatedAt: unknown;
}

/** A reason the HTTP layer turns into an `ApiError`; the service itself never speaks HTTP. */
export class ProjectMaterialInputError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'ProjectMaterialInputError';
    this.field = field;
  }
}

function toIsoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'bigint') {
    const date = new Date(Number(value));
    return Number.isFinite(date.getTime()) ? date.toISOString() : '';
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : value;
  }
  return '';
}

function toFileSize(value: number | bigint | string): number {
  const size = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(size) ? size : 0;
}

/**
 * Owner-scoped reads and writes for project materials and their attachments.
 *
 * Every method takes the signed-in user's id and never returns another user's row: the scope is part of the query,
 * not a check applied after it, so asking for a foreign id is indistinguishable from asking for a missing one. A
 * file is uploaded before the material that owns it exists; saving the material links it, and detaching clears the
 * link without ever deleting the row.
 */
export class ProjectMaterialsService {
  private readonly app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  private get database(): DatabaseManager {
    return this.app.container.resolve(databaseManagerToken);
  }

  private get materials() {
    return this.database.repository<MaterialRow>('projectMaterials');
  }

  private get files() {
    return this.database.repository<MaterialFileRow>('projectMaterialFiles');
  }

  private contentUrl(record: {
    readonly id: string;
    readonly ext: string;
  }): string {
    const base = (this.app.publicBasePath ?? '').replace(/\/$/, '');
    const id = encodeURIComponent(record.id);
    const ext = record.ext ? `.${encodeURIComponent(record.ext)}` : '';
    return `${base}${PROJECT_MATERIAL_FILES_ACCESS_PATH}/${id}${ext}`;
  }

  private toFileView(record: MaterialFileRow): ProjectMaterialFileView {
    return {
      id: record.id,
      filename: record.filename,
      ext: record.ext,
      mimeType: record.mimeType,
      size: toFileSize(record.size),
      createdAt: toIsoTimestamp(record.createdAt),
      updatedAt: toIsoTimestamp(record.updatedAt),
      contentUrl: this.contentUrl(record),
    };
  }

  private toMaterialView(
    material: MaterialRow,
    files: readonly MaterialFileRow[],
  ): ProjectMaterialView {
    return {
      id: material.id,
      title: material.title,
      description: material.description ?? null,
      createdAt: toIsoTimestamp(material.createdAt),
      updatedAt: toIsoTimestamp(material.updatedAt),
      files: files.map((file) => this.toFileView(file)),
    };
  }

  private async filesOfMaterial(
    userId: string,
    materialId: string,
  ): Promise<MaterialFileRow[]> {
    return await this.files.findMany({
      filter: { materialId, createdById: userId },
    });
  }

  /**
   * The caller's materials, newest first, one page at a time, each with the attachments linked to it. `total` is the
   * number of the caller's materials, not of the page.
   */
  async list(
    userId: string,
    page: { readonly page: number; readonly pageSize: number },
  ): Promise<{
    readonly materials: ProjectMaterialView[];
    readonly total: number;
  }> {
    const total = await this.materials.count({
      filter: { createdById: userId },
    });
    const materials = await this.materials.findMany({
      filter: { createdById: userId },
      sort: (sort) => sort.field('updatedAt').desc(),
      limit: page.pageSize,
      offset: (page.page - 1) * page.pageSize,
    });
    if (!materials.length) return { materials: [], total };
    const files = await this.files.findMany({
      filter: { createdById: userId },
    });
    const byMaterial = new Map<string, MaterialFileRow[]>();
    for (const file of files) {
      if (!file.materialId) continue;
      const group = byMaterial.get(file.materialId);
      if (group) group.push(file);
      else byMaterial.set(file.materialId, [file]);
    }
    return {
      materials: materials.map((material) =>
        this.toMaterialView(material, byMaterial.get(material.id) ?? []),
      ),
      total,
    };
  }

  async get(
    userId: string,
    id: string,
  ): Promise<ProjectMaterialView | undefined> {
    const material = await this.materials.findOne({
      filter: { id, createdById: userId },
    });
    if (!material) return undefined;
    return this.toMaterialView(
      material,
      await this.filesOfMaterial(userId, id),
    );
  }

  /** True only for the owner of the file record; the public byte route's guard reads this. */
  async ownsFile(userId: string, fileId: string): Promise<boolean> {
    const file = await this.files.findOne({ filter: { id: fileId } });
    return Boolean(file && file.createdById === userId);
  }

  /** Resolves the requested file ids to records this user owns, preserving the order given. */
  private async resolveOwnedFiles(
    userId: string,
    fileIds: readonly string[],
  ): Promise<MaterialFileRow[]> {
    const resolved: MaterialFileRow[] = [];
    for (const id of [...new Set(fileIds)]) {
      const file = await this.files.findOne({
        filter: { id, createdById: userId },
      });
      if (!file) {
        throw new ProjectMaterialInputError(
          'fileIds',
          `File ${id} does not exist or is not owned by the caller.`,
        );
      }
      // The first version accepts site photos and Word documents only. The client's picker filters as well; this is
      // the check that decides, and a rejected id names the field rather than silently dropping the attachment.
      const ext = file.ext.toLowerCase();
      if (
        !(PROJECT_MATERIAL_ATTACHMENT_EXTENSIONS as readonly string[]).includes(
          ext,
        )
      ) {
        throw new ProjectMaterialInputError(
          'fileIds',
          `File ${file.filename} is not a supported attachment; only ${PROJECT_MATERIAL_ATTACHMENT_EXTENSIONS.join(' and ')} are accepted.`,
        );
      }
      resolved.push(file);
    }
    return resolved;
  }

  /** Links each file to the material and returns the rows as they now stand. */
  private async linkFiles(
    userId: string,
    materialId: string,
    fileIds: readonly string[],
  ): Promise<MaterialFileRow[]> {
    const files = await this.resolveOwnedFiles(userId, fileIds);
    for (const file of files) {
      if (file.materialId === materialId) continue;
      await this.files.updateOne({
        filter: { id: file.id, createdById: userId },
        values: { materialId, updatedAt: new Date() },
      });
    }
    return files.map((file) => ({ ...file, materialId }));
  }

  async create(
    userId: string,
    input: ProjectMaterialCreateInput,
  ): Promise<ProjectMaterialView> {
    const title = input.title.trim();
    if (!title) {
      throw new ProjectMaterialInputError('title', 'A title is required.');
    }
    const now = new Date();
    const id = randomUUID();
    const created = await this.materials.createOne({
      values: {
        id,
        title,
        description: input.description ?? null,
        createdById: userId,
        createdAt: now,
        updatedAt: now,
      },
    });
    const files = await this.linkFiles(userId, id, input.fileIds ?? []);
    return this.toMaterialView(created.record, files);
  }

  async update(
    userId: string,
    id: string,
    input: ProjectMaterialUpdateInput,
  ): Promise<ProjectMaterialView | undefined> {
    const existing = await this.materials.findOne({
      filter: { id, createdById: userId },
    });
    if (!existing) return undefined;

    const changes: {
      updatedAt: Date;
      title?: string;
      description?: string | null;
    } = {
      updatedAt: new Date(),
    };
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) {
        throw new ProjectMaterialInputError('title', 'A title is required.');
      }
      changes.title = title;
    }
    if (input.description !== undefined) {
      changes.description = input.description;
    }
    const updated = await this.materials.updateOne({
      filter: { id, createdById: userId },
      values: changes,
    });

    let files: MaterialFileRow[];
    if (input.fileIds === undefined) {
      files = await this.filesOfMaterial(userId, id);
    } else {
      // Detach whatever was linked, then link the wanted set: a file the user removed from this material survives as
      // a row the caller still owns, it is simply no longer part of this material.
      await this.files.updateMany({
        filter: { materialId: id, createdById: userId },
        values: { materialId: null },
      });
      files = await this.linkFiles(userId, id, input.fileIds);
    }
    return this.toMaterialView(updated.record, files);
  }

  /** Returns false when the material does not exist for this owner. Files are detached, never deleted. */
  async remove(userId: string, id: string): Promise<boolean> {
    const existing = await this.materials.findOne({
      filter: { id, createdById: userId },
    });
    if (!existing) return false;
    await this.files.updateMany({
      filter: { materialId: id, createdById: userId },
      values: { materialId: null },
    });
    await this.materials.deleteOne({
      filter: { id, createdById: userId },
    });
    return true;
  }
}

export const projectMaterialsServiceToken =
  createServiceToken<ProjectMaterialsService>('app.projectMaterials');

export class ProjectMaterialsProvider extends ServiceProvider<Application> {
  readonly name = 'app.projectMaterials';

  register(): void {
    this.app.container.singleton(
      projectMaterialsServiceToken,
      () => new ProjectMaterialsService(this.app),
    );
  }
}
