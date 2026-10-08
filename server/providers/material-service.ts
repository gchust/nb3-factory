import type { Application } from '@nocobase/app-server/application';
import type { FileRecord } from '@nocobase/app-plugin-file/server';
import type { DatabaseManager, Repository } from '@nocobase/db';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';
import { randomUUID } from 'node:crypto';

/** The exposure path the File plugin's byte route is mounted at. */
export const MATERIAL_FILE_ACCESS_PATH = '/projectMaterialFiles';
export const PROJECT_MATERIALS_COLLECTION = 'projectMaterials';
export const PROJECT_MATERIAL_FILES_COLLECTION = 'projectMaterialFiles';

export type MaterialServiceErrorCode =
  'MATERIAL_NOT_FOUND' | 'MATERIAL_TITLE_REQUIRED' | 'MATERIAL_FILE_NOT_FOUND';

/** A business failure the HTTP layer maps onto a status and a reason code. */
export class MaterialServiceError extends Error {
  readonly code: MaterialServiceErrorCode;

  constructor(code: MaterialServiceErrorCode, message: string) {
    super(message);
    this.name = 'MaterialServiceError';
    this.code = code;
  }
}

/** A stored attachment: the File plugin's columns plus the two this application adds. */
export interface MaterialFileRecord extends FileRecord {
  ownerId: string;
  materialId: string | null;
}

export interface MaterialRecord {
  id: string;
  title: string;
  ownerId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** What a material endpoint returns: the material and its attachments in order. */
export interface MaterialDetail {
  id: string;
  title: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  files: MaterialFileRecord[];
}

export interface CreateMaterialInput {
  readonly title: string;
  readonly fileIds?: readonly string[];
}

export interface UpdateMaterialInput {
  readonly title?: string;
  readonly fileIds?: readonly string[];
}

/**
 * Reads and writes project materials, always scoped to the signed-in owner.
 *
 * The owner is a required argument rather than a value read from a request
 * context: every caller passes the id of the session it is already serving, and
 * a query that forgets it cannot be written here without leaving an argument
 * out. Attachments are looked up through the owner too, so a file that belongs
 * to someone else reads as "not found" instead of "not yours".
 */
export class ProjectMaterialService {
  private readonly database: DatabaseManager;
  private readonly publicBasePath: string;

  constructor(options: {
    readonly database: DatabaseManager;
    readonly publicBasePath?: string;
  }) {
    this.database = options.database;
    this.publicBasePath = options.publicBasePath ?? '';
  }

  async list(ownerId: string): Promise<MaterialDetail[]> {
    const materials = await this.materials().findMany({
      filter: { ownerId },
      sort: (sort) => sort.field('createdAt').desc(),
    });
    const files = await this.files().findMany({ filter: { ownerId } });
    const byMaterial = new Map<string, MaterialFileRecord[]>();
    for (const file of files) {
      if (!file.materialId) {
        continue;
      }
      const list = byMaterial.get(file.materialId) ?? [];
      list.push(file);
      byMaterial.set(file.materialId, list);
    }
    return materials.map((material) =>
      this.toDetail(material, byMaterial.get(material.id) ?? []),
    );
  }

  async get(ownerId: string, id: string): Promise<MaterialDetail | undefined> {
    const material = await this.materials().findOne({
      filter: { id, ownerId },
    });
    if (!material) {
      return undefined;
    }
    return this.toDetail(
      material,
      await this.attachedFiles(this.files(), ownerId, id),
    );
  }

  async create(
    ownerId: string,
    input: CreateMaterialInput,
  ): Promise<MaterialDetail> {
    const title = requireTitle(input.title);
    const fileIds = uniqueIds(input.fileIds);
    const owned = await this.ownedFiles(this.files(), ownerId);
    assertOwned(owned, fileIds);

    const id = await this.database.transaction(async (connection) => {
      const now = new Date();
      // The Collection's primary key is a `char(36)` uuid with no database
      // default, and the Repository does not invent one; the File plugin
      // generates its own ids the same way.
      const materialId = randomUUID();
      await connection
        .repository<MaterialRecord>(PROJECT_MATERIALS_COLLECTION)
        .createOne({
          values: {
            id: materialId,
            title,
            ownerId,
            createdAt: now,
            updatedAt: now,
          },
        });
      await this.attach(
        connection.repository<MaterialFileRecord>(
          PROJECT_MATERIAL_FILES_COLLECTION,
        ),
        materialId,
        fileIds,
      );
      return materialId;
    });

    const detail = await this.get(ownerId, id);
    if (!detail) {
      throw new MaterialServiceError(
        'MATERIAL_NOT_FOUND',
        'The material was created but could not be read back.',
      );
    }
    return detail;
  }

  async update(
    ownerId: string,
    id: string,
    input: UpdateMaterialInput,
  ): Promise<MaterialDetail> {
    const material = await this.materials().findOne({
      filter: { id, ownerId },
    });
    if (!material) {
      throw new MaterialServiceError(
        'MATERIAL_NOT_FOUND',
        'This material does not exist.',
      );
    }

    const title =
      input.title === undefined ? undefined : requireTitle(input.title);
    const fileIds =
      input.fileIds === undefined ? undefined : uniqueIds(input.fileIds);
    if (fileIds) {
      const owned = await this.ownedFiles(this.files(), ownerId);
      assertOwned(owned, fileIds);
    }

    await this.database.transaction(async (connection) => {
      const files = connection.repository<MaterialFileRecord>(
        PROJECT_MATERIAL_FILES_COLLECTION,
      );
      if (title !== undefined) {
        await connection
          .repository<MaterialRecord>(PROJECT_MATERIALS_COLLECTION)
          .updateOne({
            filter: { id, ownerId },
            values: { title, updatedAt: new Date() },
          });
      }
      if (fileIds) {
        // Removal is a detach: the submitted set is the complete new set, so
        // anything attached before that is not in it is unlinked, not deleted.
        const attached = await this.attachedFiles(files, ownerId, id);
        const keep = new Set(fileIds);
        for (const file of attached) {
          if (!keep.has(file.id)) {
            await files.updateOne({
              filter: { id: file.id },
              values: { materialId: null, updatedAt: new Date() },
            });
          }
        }
        await this.attach(files, id, fileIds);
      }
    });

    const updated = await this.get(ownerId, id);
    if (!updated) {
      throw new MaterialServiceError(
        'MATERIAL_NOT_FOUND',
        'This material does not exist.',
      );
    }
    return updated;
  }

  /** The URL the File plugin serves this attachment's bytes at, public base path included. */
  contentUrl(record: Pick<MaterialFileRecord, 'id' | 'ext'>): string {
    const base = this.publicBasePath.replace(/\/$/, '');
    const ext = record.ext ? `.${encodeURIComponent(record.ext)}` : '';
    return `${base}${MATERIAL_FILE_ACCESS_PATH}/${encodeURIComponent(record.id)}${ext}`;
  }

  private materials(): Repository<MaterialRecord> {
    return this.database.repository<MaterialRecord>(
      PROJECT_MATERIALS_COLLECTION,
    );
  }

  private files(): Repository<MaterialFileRecord> {
    return this.database.repository<MaterialFileRecord>(
      PROJECT_MATERIAL_FILES_COLLECTION,
    );
  }

  private async ownedFiles(
    files: Repository<MaterialFileRecord>,
    ownerId: string,
  ): Promise<Map<string, MaterialFileRecord>> {
    const owned = await files.findMany({ filter: { ownerId } });
    return new Map(owned.map((file) => [file.id, file]));
  }

  private async attachedFiles(
    files: Repository<MaterialFileRecord>,
    ownerId: string,
    materialId: string,
  ): Promise<MaterialFileRecord[]> {
    const attached = await files.findMany({
      filter: { ownerId, materialId },
      sort: (sort) => sort.field('createdAt').asc(),
    });
    return [...attached];
  }

  private async attach(
    files: Repository<MaterialFileRecord>,
    materialId: string,
    fileIds: readonly string[],
  ): Promise<void> {
    for (const id of fileIds) {
      await files.updateOne({
        filter: { id },
        values: { materialId, updatedAt: new Date() },
      });
    }
  }

  private toDetail(
    material: MaterialRecord,
    files: MaterialFileRecord[],
  ): MaterialDetail {
    const ordered = [...files].sort(
      (left, right) =>
        new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime(),
    );
    return {
      id: material.id,
      title: material.title,
      createdAt: material.createdAt,
      updatedAt: material.updatedAt,
      files: ordered.map((file) => ({
        ...file,
        size: Number(file.size),
        contentUrl: this.contentUrl(file),
      })),
    };
  }
}

export const materialServiceToken = createServiceToken<ProjectMaterialService>(
  'projectMaterialService',
);

/** Binds the service to the application's database and public base path. */
export class MaterialServiceProvider extends ServiceProvider<Application> {
  readonly name = 'projectMaterials';

  register(): void {
    this.app.container.singleton(
      materialServiceToken,
      (resolver) =>
        new ProjectMaterialService({
          database: resolver.resolve(databaseManagerToken),
          publicBasePath: this.app.publicBasePath,
        }),
    );
  }
}

function requireTitle(value: string): string {
  const title = value.trim();
  if (!title) {
    throw new MaterialServiceError(
      'MATERIAL_TITLE_REQUIRED',
      'A material needs a title before it can be saved.',
    );
  }
  return title;
}

function uniqueIds(values: readonly string[] | undefined): string[] {
  if (!values) {
    return [];
  }
  return [...new Set(values)];
}

function assertOwned(
  owned: Map<string, MaterialFileRecord>,
  fileIds: readonly string[],
): void {
  for (const id of fileIds) {
    if (!owned.has(id)) {
      throw new MaterialServiceError(
        'MATERIAL_FILE_NOT_FOUND',
        'One of the selected attachments is no longer available.',
      );
    }
  }
}
