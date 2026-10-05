import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  RepositoryError,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/**
 * Project materials: a titled record with private attachments.
 *
 * The two Collections are created by `202610200001_create_project_materials`.
 * Visibility is a property of `createdById`: every read and write below filters
 * on the owner, and a row belonging to somebody else is reported as missing
 * rather than forbidden so a link cannot be used to test which ids exist.
 *
 * An uploaded file exists before its material does. `materialId` is therefore
 * nullable and is set only when the material form is submitted, which is what
 * lets a failed save keep the uploaded bytes and succeed on a later retry
 * without uploading again. Removing an attachment clears `materialId`; it never
 * deletes the stored object.
 */

export const MATERIALS_COLLECTION = 'project_materials';
export const MATERIAL_FILES_COLLECTION = 'project_material_files';

/**
 * The Client resource name of the File Repository exposure for these
 * attachments. It is the Collection name on purpose: the verification and the
 * NocoBase data conventions both address this table as
 * `/api/project_material_files:<action>`.
 */
export const MATERIAL_FILES_RESOURCE = 'project_material_files';
/** The Drive disk the attachments are stored on; `local` is the application default. */
export const MATERIAL_FILES_DISK = 'local';
/** The public content path the secured file exposure mounts at. */
export const MATERIAL_FILES_ACCESS_PATH = '/uploads/project_material_files';
/** The NocoBase-style resource name of the material records. */
export const MATERIALS_RESOURCE = 'project_materials';
/** The MIME type and extension pair the first version accepts. */
export const MATERIAL_FILE_MIME_TYPES = [
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const MAX_MATERIAL_TITLE_LENGTH = 255;
export const MAX_MATERIAL_FILES = 20;

export interface MaterialRow {
  readonly id: number;
  readonly seedKey: string | null;
  readonly title: string;
  readonly createdById: string;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
}

export interface MaterialFileRow {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: string | number;
  readonly createdById: string;
  readonly materialId: number | null;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
}

export interface MaterialDetail {
  readonly id: number;
  readonly title: string;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
  readonly files: readonly MaterialFileRow[];
}

export interface MaterialWriteInput {
  readonly title: string;
  readonly fileIds: readonly string[];
}

export interface MaterialUpdateInput {
  readonly title?: string;
  readonly fileIds?: readonly string[];
}

export type MaterialErrorCode =
  | 'TITLE_REQUIRED'
  | 'TITLE_TOO_LONG'
  | 'INVALID_FILE_IDS'
  | 'TOO_MANY_FILES'
  | 'FILE_NOT_AVAILABLE';

/** A failure of the caller's input, which a route answers with 400. */
export class MaterialError extends Error {
  public readonly code: MaterialErrorCode;

  public constructor(code: MaterialErrorCode, message: string) {
    super(message);
    this.name = 'MaterialError';
    this.code = code;
  }
}

export interface MaterialService {
  /** The caller's materials, newest first, each with its attached files. */
  list(ownerId: string): Promise<readonly MaterialDetail[]>;
  /** The caller's material, or undefined when it does not exist or belongs to somebody else. */
  get(ownerId: string, id: number): Promise<MaterialDetail | undefined>;
  create(ownerId: string, input: MaterialWriteInput): Promise<MaterialDetail>;
  /** undefined when the material does not exist or belongs to somebody else. */
  update(
    ownerId: string,
    id: number,
    input: MaterialUpdateInput,
  ): Promise<MaterialDetail | undefined>;
  /** false when the material does not exist or belongs to somebody else. */
  remove(ownerId: string, id: number): Promise<boolean>;
  /**
   * The caller's own uploaded file, for the content route's ownership check.
   * A file is visible to the account that uploaded it and to nobody else.
   */
  findOwnFile(
    ownerId: string,
    fileId: string,
  ): Promise<MaterialFileRow | undefined>;
  /**
   * The caller's own uploaded files, oldest first, optionally narrowed to one
   * material. This is the read side of the NocoBase-style file listing.
   */
  listFiles(
    ownerId: string,
    materialId?: number,
  ): Promise<readonly MaterialFileRow[]>;
}

export const materialServiceToken: ServiceToken<MaterialService> =
  createServiceToken<MaterialService>('app/material-service');

type MaterialFiles = Repository<MaterialFileRow>;
type Materials = Repository<MaterialRow>;

/**
 * The `repository(collection)` handle shared by a DatabaseManager and one of
 * its DatabaseConnections. Annotating the helpers with this narrow shape lets
 * the same code run against the manager outside a transaction and against the
 * transaction's connection inside one.
 */
type RepositoryAccessor = Pick<DatabaseManager, 'repository'>;

function materials(accessor: RepositoryAccessor): Materials {
  return accessor.repository<MaterialRow>(MATERIALS_COLLECTION);
}

function files(accessor: RepositoryAccessor): MaterialFiles {
  return accessor.repository<MaterialFileRow>(MATERIAL_FILES_COLLECTION);
}

function normalizeTitle(value: unknown): string {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title) {
    throw new MaterialError('TITLE_REQUIRED', 'A material title is required.');
  }
  if (title.length > MAX_MATERIAL_TITLE_LENGTH) {
    throw new MaterialError(
      'TITLE_TOO_LONG',
      `A material title may not be longer than ${MAX_MATERIAL_TITLE_LENGTH} characters.`,
    );
  }
  return title;
}

function normalizeFileIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new MaterialError(
      'INVALID_FILE_IDS',
      'fileIds must be an array of file ids.',
    );
  }
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) {
      throw new MaterialError(
        'INVALID_FILE_IDS',
        'Every file id must be a non-empty string.',
      );
    }
    if (!ids.includes(item)) ids.push(item);
  }
  if (ids.length > MAX_MATERIAL_FILES) {
    throw new MaterialError(
      'TOO_MANY_FILES',
      `A material may not have more than ${MAX_MATERIAL_FILES} attachments.`,
    );
  }
  return ids;
}

/**
 * Verifies that every id names a file this account uploaded and that the file
 * is free or already linked to this very material, then returns the rows.
 */
async function claimFiles(
  repository: MaterialFiles,
  ownerId: string,
  fileIds: readonly string[],
  materialId: number | null,
): Promise<MaterialFileRow[]> {
  const claimed: MaterialFileRow[] = [];
  for (const fileId of fileIds) {
    const file = await repository.findOne({
      filter: { id: fileId, createdById: ownerId },
    });
    if (!file || (file.materialId !== null && file.materialId !== materialId)) {
      throw new MaterialError(
        'FILE_NOT_AVAILABLE',
        'An attachment is missing or belongs to another record.',
      );
    }
    claimed.push(file);
  }
  return claimed;
}

/** Links the caller's files to a material, stamping the update time. */
async function linkFiles(
  repository: MaterialFiles,
  ownerId: string,
  fileIds: readonly string[],
  materialId: number,
  now: Date,
): Promise<void> {
  for (const fileId of fileIds) {
    await repository.updateOne({
      filter: { id: fileId, createdById: ownerId },
      values: { materialId, updatedAt: now },
    });
  }
}

/** Detaches the caller's files from a material without touching the objects. */
async function detachFiles(
  repository: MaterialFiles,
  ownerId: string,
  fileIds: readonly string[],
  now: Date,
): Promise<void> {
  for (const fileId of fileIds) {
    await repository.updateOne({
      filter: { id: fileId, createdById: ownerId, materialId: undefined },
      values: { materialId: null, updatedAt: now },
    });
  }
}

async function readMaterialFiles(
  accessor: RepositoryAccessor,
  ownerId: string,
  materialId: number,
): Promise<MaterialFileRow[]> {
  return files(accessor).findMany({
    filter: { createdById: ownerId, materialId },
    sort: (sort) => sort.field('createdAt').asc(),
  });
}

function toDetail(
  material: MaterialRow,
  attached: readonly MaterialFileRow[],
): MaterialDetail {
  return {
    id: Number(material.id),
    title: material.title,
    createdAt: material.createdAt,
    updatedAt: material.updatedAt,
    files: attached,
  };
}

function isRecordNotFound(error: unknown): boolean {
  return error instanceof RepositoryError && error.code === 'RECORD_NOT_FOUND';
}

export function createMaterialService(
  database: DatabaseManager,
): MaterialService {
  return {
    async list(ownerId) {
      const records = await materials(database).findMany({
        filter: { createdById: ownerId },
        sort: (sort) => sort.field('createdAt').desc(),
      });
      const owned = await files(database).findMany({
        filter: { createdById: ownerId },
        sort: (sort) => sort.field('createdAt').asc(),
      });
      const byMaterial = new Map<number, MaterialFileRow[]>();
      for (const file of owned) {
        if (file.materialId === null) continue;
        const bucket = byMaterial.get(Number(file.materialId)) ?? [];
        bucket.push(file);
        byMaterial.set(Number(file.materialId), bucket);
      }
      return records.map((record) =>
        toDetail(record, byMaterial.get(Number(record.id)) ?? []),
      );
    },

    async get(ownerId, id) {
      const record = await materials(database).findOne({
        filter: { id, createdById: ownerId },
      });
      if (!record) return undefined;
      return toDetail(
        record,
        await readMaterialFiles(database.connection(), ownerId, id),
      );
    },

    async create(ownerId, input) {
      const title = normalizeTitle(input.title);
      const fileIds = normalizeFileIds(input.fileIds);
      return database.transaction(async (connection) => {
        const now = new Date();
        const repository = files(connection);
        await claimFiles(repository, ownerId, fileIds, null);
        const { record } = await materials(connection).createOne({
          values: {
            title,
            createdById: ownerId,
            createdAt: now,
            updatedAt: now,
          },
        });
        const id = Number(record.id);
        if (fileIds.length) {
          await linkFiles(repository, ownerId, fileIds, id, now);
        }
        return toDetail(record, [
          ...(await readMaterialFiles(connection, ownerId, id)),
        ]);
      });
    },

    async update(ownerId, id, input) {
      const title =
        input.title === undefined ? undefined : normalizeTitle(input.title);
      const fileIds =
        input.fileIds === undefined
          ? undefined
          : normalizeFileIds(input.fileIds);

      return database.transaction(async (connection) => {
        const materialRepository = materials(connection);
        const existing = await materialRepository.findOne({
          filter: { id, createdById: ownerId },
        });
        if (!existing) return undefined;
        const now = new Date();
        if (title !== undefined || fileIds !== undefined) {
          await materialRepository.updateOne({
            filter: { id, createdById: ownerId },
            values: {
              ...(title === undefined ? {} : { title }),
              updatedAt: now,
            },
          });
        }

        if (fileIds !== undefined) {
          const repository = files(connection);
          await claimFiles(repository, ownerId, fileIds, id);
          const current = await readMaterialFiles(connection, ownerId, id);
          const removed = current.filter((file) => !fileIds.includes(file.id));
          if (removed.length) {
            await detachFiles(
              repository,
              ownerId,
              removed.map((file) => file.id),
              now,
            );
          }
          const added = fileIds.filter(
            (fileId) =>
              !current.some((file) => file.id === fileId) ||
              current.some(
                (file) => file.id === fileId && file.materialId !== id,
              ),
          );
          if (added.length) {
            await linkFiles(repository, ownerId, added, id, now);
          }
        }

        const updated = await materialRepository.findOne({
          filter: { id, createdById: ownerId },
        });
        if (!updated) return undefined;
        return toDetail(
          updated,
          await readMaterialFiles(connection, ownerId, id),
        );
      });
    },

    async remove(ownerId, id) {
      return database.transaction(async (connection) => {
        const repository = materials(connection);
        const existing = await repository.findOne({
          filter: { id, createdById: ownerId },
        });
        if (!existing) return false;
        // Detach explicitly rather than relying on the foreign key's
        // `on delete set null`, so the behavior is the same on every dialect
        // and the timestamps are stamped like any other update.
        const now = new Date();
        const attached = await readMaterialFiles(connection, ownerId, id);
        if (attached.length) {
          await detachFiles(
            files(connection),
            ownerId,
            attached.map((file) => file.id),
            now,
          );
        }
        try {
          await repository.deleteOne({ filter: { id, createdById: ownerId } });
        } catch (error) {
          if (isRecordNotFound(error)) return false;
          throw error;
        }
        return true;
      });
    },

    async findOwnFile(ownerId, fileId) {
      return files(database).findOne({
        filter: { id: fileId, createdById: ownerId },
      });
    },

    async listFiles(ownerId, materialId) {
      return files(database).findMany({
        filter: {
          createdById: ownerId,
          ...(materialId === undefined ? {} : { materialId }),
        },
        sort: (sort) => sort.field('createdAt').asc(),
      });
    },
  };
}

export class MaterialServiceProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/materials';

  public override register(): void {
    this.app.container.singleton(materialServiceToken, () =>
      createMaterialService(this.app.container.resolve(databaseManagerToken)),
    );
  }
}

export default MaterialServiceProvider;
