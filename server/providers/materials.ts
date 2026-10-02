import { randomUUID } from 'node:crypto';

import type { Application } from '@nocobase/app-server/application';
import { joinBasePath } from '@nocobase/app-server/support';
import {
  databaseManagerToken,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

// Domain logic for project materials and their attachments.
//
// A material is a title plus a set of files; both belong to exactly one user
// (the uploader) and no one else may read them. Ownership is a plain
// `createdById` column checked in the queries here, which keeps this feature
// independent of the Authorization plugin and of the exact shape of the
// Authentication plugin's tables.
//
// This service knows nothing about HTTP. It throws `MaterialError` carrying a
// stable `code`; the route layer turns that code into a status and a body.

/** Logical Collection name of a project material. */
export const MATERIAL_COLLECTION = 'projectMaterials';
/** Logical Collection name of an attachment. */
export const MATERIAL_FILE_COLLECTION = 'materialFiles';
/** Public path prefix the file plugin's byte route serves attachments from. */
export const MATERIAL_ACCESS_PATH = '/uploads/materials';
/** `title` column length, mirrored from the migration. */
export const MATERIAL_TITLE_MAX_LENGTH = 255;

/** Stable failure codes. The route layer maps each to an HTTP status. */
export type MaterialErrorCode =
  | 'MATERIAL_TITLE_REQUIRED'
  | 'MATERIAL_TITLE_TOO_LONG'
  | 'MATERIAL_INVALID_FILES'
  | 'MATERIAL_NOT_FOUND'
  | 'MATERIAL_FORBIDDEN'
  | 'MATERIAL_FILE_NOT_FOUND'
  | 'MATERIAL_FILE_FORBIDDEN';

export class MaterialError extends Error {
  public readonly code: MaterialErrorCode;

  public constructor(code: MaterialErrorCode, message: string) {
    super(message);
    this.name = 'MaterialError';
    this.code = code;
  }
}

/** A row of `material_files`, in logical field names. */
export interface MaterialFileRow {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: string | number | bigint;
  createdById: string | null;
  materialId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** A row of `project_materials`, in logical field names. */
export interface ProjectMaterialRow {
  id: string;
  title: string;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** An attachment as the browser sees it. Mirrors the file plugin `FileRecord`. */
export interface MaterialFile {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  /** BIGINT-backed collections return an exact string, so normalize it. */
  size: number;
  createdAt: string;
  updatedAt: string;
  /** Same-origin path that streams the bytes; the byte route re-checks ownership. */
  contentUrl: string;
}

export interface Material {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  files: MaterialFile[];
}

export interface MaterialInput {
  title?: unknown;
  fileIds?: unknown;
}

/** Outcome of asking whether a user may read one attachment. */
export type MaterialFileAccess = 'allowed' | 'missing' | 'denied';

export interface MaterialService {
  list(ownerId: string): Promise<Material[]>;
  detail(ownerId: string, id: string): Promise<Material>;
  create(ownerId: string, input: MaterialInput): Promise<Material>;
  update(ownerId: string, id: string, input: MaterialInput): Promise<Material>;
  remove(ownerId: string, id: string): Promise<void>;
  /** Used by the byte route guard; never returns a record. */
  checkFileAccess(ownerId: string, fileId: string): Promise<MaterialFileAccess>;
}

export interface MaterialServiceDependencies {
  readonly database: DatabaseManager;
  /** Resolved lazily so a base-path change is reflected without rebuilding. */
  readonly publicBasePath: () => string;
}

export const materialServiceToken: ServiceToken<MaterialService> =
  createServiceToken<MaterialService>('nb3-factory/materials');

function materialRepository(source: DatabaseManager | DatabaseConnection) {
  return source.repository<ProjectMaterialRow, Partial<ProjectMaterialRow>>(
    MATERIAL_COLLECTION,
  );
}

function fileRepository(source: DatabaseManager | DatabaseConnection) {
  return source.repository<MaterialFileRow, Partial<MaterialFileRow>>(
    MATERIAL_FILE_COLLECTION,
  );
}

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function normalizeTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new MaterialError('MATERIAL_TITLE_REQUIRED', 'A title is required.');
  }
  const title = value.trim();
  if (title.length === 0) {
    throw new MaterialError('MATERIAL_TITLE_REQUIRED', 'A title is required.');
  }
  if (title.length > MATERIAL_TITLE_MAX_LENGTH) {
    throw new MaterialError(
      'MATERIAL_TITLE_TOO_LONG',
      `The title may not exceed ${MATERIAL_TITLE_MAX_LENGTH} characters.`,
    );
  }
  return title;
}

/** Validates a file-id list and removes duplicates. */
function normalizeFileIds(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (
    !Array.isArray(value) ||
    value.some((id) => typeof id !== 'string' || id.trim().length === 0)
  ) {
    throw new MaterialError(
      'MATERIAL_INVALID_FILES',
      'fileIds must be an array of file identifiers.',
    );
  }
  return [...new Set(value.map((id) => id.trim()))];
}

function normalizeSize(value: string | number | bigint): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : 0;
  }
  return value;
}

function isoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/** Strips a byte-route token such as `<uuid>.png` down to its id. */
export function parseMaterialFileToken(token: string): string | null {
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const dot = trimmed.indexOf('.');
  return dot === -1 ? trimmed : trimmed.slice(0, dot);
}

/**
 * Reads one attachment row and reports whether `ownerId` may read it.
 *
 * Deliberately returns no record: the caller only needs the decision, and a
 * record in hand invites a second, differently-scoped read later.
 */
async function fileAccess(
  source: DatabaseManager,
  ownerId: string,
  fileId: string,
): Promise<MaterialFileAccess> {
  const record = await fileRepository(source).findOne({
    filter: { id: fileId },
  });
  if (!record) {
    return 'missing';
  }
  return record.createdById === ownerId ? 'allowed' : 'denied';
}

/** Serializes one attachment, including the guarded same-origin content path. */
function serializeFile(
  record: MaterialFileRow,
  publicBasePath: string,
): MaterialFile {
  const segment = `${encodeURIComponent(record.id)}${
    record.ext ? `.${encodeURIComponent(record.ext)}` : ''
  }`;
  return {
    id: record.id,
    disk: record.disk,
    key: record.key,
    filename: record.filename,
    ext: record.ext,
    mimeType: record.mimeType,
    size: normalizeSize(record.size),
    createdAt: isoString(record.createdAt),
    updatedAt: isoString(record.updatedAt),
    contentUrl: joinBasePath(publicBasePath, `${MATERIAL_ACCESS_PATH}/${segment}`),
  };
}

function serializeMaterial(
  record: ProjectMaterialRow,
  files: readonly MaterialFileRow[],
  publicBasePath: string,
): Material {
  return {
    id: record.id,
    title: record.title,
    createdAt: isoString(record.createdAt),
    updatedAt: isoString(record.updatedAt),
    files: files.map((file) => serializeFile(file, publicBasePath)),
  };
}

/**
 * Loads the material and asserts that this user owns it.
 *
 * `MATERIAL_NOT_FOUND` and `MATERIAL_FORBIDDEN` are deliberately distinct so
 * the route can answer 404 and 403 differently, which the tests pin.
 */
async function findOwnedMaterial(
  source: DatabaseManager | DatabaseConnection,
  ownerId: string,
  id: string,
): Promise<ProjectMaterialRow> {
  const record = await materialRepository(source).findOne({ filter: { id } });
  if (!record) {
    throw new MaterialError('MATERIAL_NOT_FOUND', 'Material not found.');
  }
  if (record.createdById !== ownerId) {
    throw new MaterialError(
      'MATERIAL_FORBIDDEN',
      'This material belongs to another user.',
    );
  }
  return record;
}

/** Verifies every id names an attachment this user uploaded, without writing. */
async function assertFileIdsOwned(
  source: DatabaseManager | DatabaseConnection,
  ownerId: string,
  fileIds: readonly string[],
): Promise<void> {
  if (fileIds.length === 0) {
    return;
  }
  const records = await fileRepository(source).findMany({
    filter: (filter) =>
      filter.or(fileIds.map((id) => filter.string('id').eq(id))),
  });
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const id of fileIds) {
    const record = byId.get(id);
    if (!record) {
      throw new MaterialError(
        'MATERIAL_FILE_NOT_FOUND',
        'One of the selected files no longer exists.',
      );
    }
    if (record.createdById !== ownerId) {
      throw new MaterialError(
        'MATERIAL_FILE_FORBIDDEN',
        'One of the selected files belongs to another user.',
      );
    }
  }
}

/**
 * Implements the service against a database manager.
 *
 * Every read filters by `createdById`, so another user's rows are never in the
 * result set rather than being filtered out afterwards.
 */
export function createMaterialService(
  dependencies: MaterialServiceDependencies,
): MaterialService {
  const { database, publicBasePath } = dependencies;
  const basePath = (): string => publicBasePath() ?? '';
  const materialRepo = materialRepository(database);
  const fileRepo = fileRepository(database);

  async function loadFiles(
    materialId: string,
    ownerId: string,
  ): Promise<MaterialFileRow[]> {
    return fileRepo.findMany({
      filter: (filter) =>
        filter.and([
          filter.string('materialId').eq(materialId),
          filter.string('createdById').eq(ownerId),
        ]),
      sort: (sort) => sort.field('createdAt').asc(),
    });
  }

  return {
    async list(ownerId) {
      const materials = await materialRepo.findMany({
        filter: { createdById: ownerId },
        sort: (sort) => sort.field('createdAt').desc(),
      });
      if (materials.length === 0) {
        return [];
      }
      const ids = materials.map((material) => material.id);
      const files = await fileRepo.findMany({
        filter: (filter) =>
          filter.and([
            filter.string('createdById').eq(ownerId),
            filter.or(ids.map((id) => filter.string('materialId').eq(id))),
          ]),
        sort: (sort) => sort.field('createdAt').asc(),
      });
      const byMaterial = new Map<string, MaterialFileRow[]>();
      for (const file of files) {
        const key = file.materialId;
        if (key === null) {
          continue;
        }
        const bucket = byMaterial.get(key);
        if (bucket) {
          bucket.push(file);
        } else {
          byMaterial.set(key, [file]);
        }
      }
      return materials.map((material) =>
        serializeMaterial(material, byMaterial.get(material.id) ?? [], basePath()),
      );
    },

    async detail(ownerId, id) {
      const record = await findOwnedMaterial(database, ownerId, id);
      const files = await loadFiles(record.id, ownerId);
      return serializeMaterial(record, files, basePath());
    },

    async create(ownerId, input) {
      const title = normalizeTitle(input.title);
      const fileIds = normalizeFileIds(input.fileIds);
      const now = new Date();
      const id = randomUUID();
      let created: ProjectMaterialRow | undefined;
      await database.transaction(async (connection) => {
        await assertFileIdsOwned(connection, ownerId, fileIds);
        created = (
          await materialRepository(connection).createOne({
            values: {
              id,
              title,
              createdById: ownerId,
              createdAt: now,
              updatedAt: now,
            },
          })
        ).record;
        for (const fileId of fileIds) {
          await fileRepository(connection).updateOne({
            filter: { id: fileId },
            values: { materialId: id, updatedAt: now },
          });
        }
      });
      if (!created) {
        throw new MaterialError('MATERIAL_NOT_FOUND', 'Material not found.');
      }
      const files = await loadFiles(id, ownerId);
      return serializeMaterial(created, files, basePath());
    },

    async update(ownerId, id, input) {
      const record = await findOwnedMaterial(database, ownerId, id);
      const nextTitle = hasOwn(input, 'title')
        ? normalizeTitle(input.title)
        : undefined;
      const replaceFiles = hasOwn(input, 'fileIds');
      const fileIds = replaceFiles ? normalizeFileIds(input.fileIds) : [];
      const now = new Date();
      let updated = record;
      await database.transaction(async (connection) => {
        if (replaceFiles) {
          await assertFileIdsOwned(connection, ownerId, fileIds);
        }
        if (nextTitle !== undefined) {
          updated = (
            await materialRepository(connection).updateOne({
              filter: { id: record.id },
              values: { title: nextTitle, updatedAt: now },
            })
          ).record;
        }
        if (replaceFiles) {
          // Detaching first keeps the stored set equal to the request, which is
          // what makes removing an attachment on the page a real detach.
          await fileRepository(connection).updateMany({
            filter: { materialId: record.id },
            values: { materialId: null, updatedAt: now },
          });
          for (const fileId of fileIds) {
            await fileRepository(connection).updateOne({
              filter: { id: fileId },
              values: { materialId: record.id, updatedAt: now },
            });
          }
        }
      });
      const files = await loadFiles(record.id, ownerId);
      return serializeMaterial(updated, files, basePath());
    },

    async remove(ownerId, id) {
      await findOwnedMaterial(database, ownerId, id);
      await database.transaction(async (connection) => {
        // Detach only: the objects stay in storage, matching the requirement's
        // "no recycle bin, no file destruction".
        await fileRepository(connection).updateMany({
          filter: { materialId: id },
          values: { materialId: null },
        });
        await materialRepository(connection).deleteOne({ filter: { id } });
      });
    },

    async checkFileAccess(ownerId, fileId) {
      return fileAccess(database, ownerId, fileId);
    },
  };
}

export default class MaterialServiceProvider extends ServiceProvider<Application> {
  public readonly name: string = 'nb3-factory/materials-provider';

  public override register(): void {
    this.app.container.singleton(materialServiceToken, () =>
      createMaterialService({
        database: this.app.container.resolve(databaseManagerToken),
        publicBasePath: () => this.app.publicBasePath,
      }),
    );
  }
}