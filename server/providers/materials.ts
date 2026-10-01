import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/**
 * One material: a title the owner can see in the list, and nothing else the
 * owner has to maintain. The attachments live in `material_files` with a
 * `materialId` that is null until the material is saved.
 */
export interface MaterialRecord {
  readonly id: string;
  readonly title: string;
  readonly ownerId: string;
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
}

/** Attachment metadata as the file plugin stores it, plus the binding column. */
export interface MaterialFileRecord {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number | bigint | string;
  readonly ownerId: string;
  readonly materialId: string | null;
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
}

export interface MaterialWithFiles {
  readonly material: MaterialRecord;
  readonly files: readonly MaterialFileRecord[];
}

export interface MaterialInput {
  readonly title?: unknown;
  readonly fileIds?: unknown;
}

export class MaterialValidationError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = 'MaterialValidationError';
    this.code = code;
  }
}

export interface MaterialsService {
  list(ownerId: string): Promise<MaterialWithFiles[]>;
  get(ownerId: string, id: string): Promise<MaterialWithFiles | undefined>;
  create(ownerId: string, input: MaterialInput): Promise<MaterialWithFiles>;
  update(
    ownerId: string,
    id: string,
    input: MaterialInput,
  ): Promise<MaterialWithFiles | undefined>;
  remove(ownerId: string, id: string): Promise<boolean>;
}

export const materialsServiceToken: ServiceToken<MaterialsService> =
  createServiceToken<MaterialsService>('app/materials-service');

/** The title is the only thing the user types; everything else has a fixed shape. */
function readTitle(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new MaterialValidationError(
      'VALIDATION_TITLE_REQUIRED',
      'A material title is required.',
    );
  }
  return value.trim();
}

/**
 * The client sends the ids of the files it uploaded. Anything else is ignored:
 * an id is only accepted when the file exists and belongs to the same owner,
 * so a forged id cannot attach somebody else's attachment.
 */
function readFileIds(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new MaterialValidationError(
      'VALIDATION_FILE_IDS_INVALID',
      'fileIds must be an array of attachment ids.',
    );
  }
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new MaterialValidationError(
        'VALIDATION_FILE_IDS_INVALID',
        'fileIds must be an array of attachment ids.',
      );
    }
    if (!ids.includes(entry)) {
      ids.push(entry);
    }
  }
  return ids;
}

function now(): string {
  return new Date().toISOString();
}

export function createMaterialsService(
  database: DatabaseManager,
): MaterialsService {
  const materials = database.repository<MaterialRecord>('project_materials');
  const files = database.repository<MaterialFileRecord>('material_files');

  async function filesOf(
    ownerId: string,
    materialId: string,
  ): Promise<MaterialFileRecord[]> {
    return files.findMany({
      filter: { ownerId, materialId },
      sort: (sort) => sort.field('createdAt').asc(),
    });
  }

  async function decorate(
    material: MaterialRecord,
  ): Promise<MaterialWithFiles> {
    return {
      material,
      files: await filesOf(material.ownerId, material.id),
    };
  }

  /**
   * Binds the submitted ids to the material and detaches every other file that
   * was bound to it. Detaching is a value change on `materialId`; the bytes and
   * the metadata row stay exactly as they are, which is what makes the two
   * operations (remove and re-add before saving) reversible without re-upload.
   */
  async function syncFiles(
    ownerId: string,
    materialId: string,
    fileIds: readonly string[],
  ): Promise<void> {
    const bound = await files.findMany({
      filter: { ownerId, materialId },
    });
    const keep = new Set(fileIds);
    const timestamp = now();
    for (const record of bound) {
      if (!keep.has(record.id)) {
        await files.updateOne({
          filter: { id: record.id, ownerId },
          values: { materialId: null, updatedAt: timestamp },
        });
      }
    }
    for (const fileId of fileIds) {
      const record = await files.findOne({
        filter: { id: fileId, ownerId },
      });
      if (!record || record.materialId === materialId) {
        continue;
      }
      await files.updateOne({
        filter: { id: fileId, ownerId },
        values: { materialId, updatedAt: timestamp },
      });
    }
  }

  return {
    async list(ownerId) {
      const records = await materials.findMany({
        filter: { ownerId },
        sort: (sort) => sort.field('createdAt').desc(),
      });
      return Promise.all(records.map((record) => decorate(record)));
    },

    async get(ownerId, id) {
      const record = await materials.findOne({ filter: { id, ownerId } });
      return record ? decorate(record) : undefined;
    },

    async create(ownerId, input) {
      const title = readTitle(input.title);
      const fileIds = readFileIds(input.fileIds);
      const id = crypto.randomUUID();
      const timestamp = now();
      const { record } = await materials.createOne({
        values: {
          id,
          title,
          ownerId,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
      await syncFiles(ownerId, id, fileIds);
      return decorate(record);
    },

    async update(ownerId, id, input) {
      const existing = await materials.findOne({ filter: { id, ownerId } });
      if (!existing) {
        return undefined;
      }
      const values: { title?: string; updatedAt: string } = {
        updatedAt: now(),
      };
      if (input.title !== undefined) {
        values.title = readTitle(input.title);
      }
      const fileIds =
        input.fileIds === undefined ? undefined : readFileIds(input.fileIds);
      const { record } = await materials.updateOne({
        filter: { id, ownerId },
        values,
      });
      if (fileIds) {
        await syncFiles(ownerId, id, fileIds);
      }
      return decorate(record);
    },

    async remove(ownerId, id) {
      const existing = await materials.findOne({ filter: { id, ownerId } });
      if (!existing) {
        return false;
      }
      const bound = await files.findMany({
        filter: { ownerId, materialId: id },
      });
      const timestamp = now();
      for (const record of bound) {
        await files.updateOne({
          filter: { id: record.id, ownerId },
          values: { materialId: null, updatedAt: timestamp },
        });
      }
      await materials.deleteOne({ filter: { id, ownerId } });
      return true;
    },
  };
}

/** Registers the service under its token; the route resolves it and never constructs one. */
export default class MaterialsProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/materials-provider';

  public override register(): void {
    this.app.container.singleton(materialsServiceToken, (resolver) => {
      return createMaterialsService(resolver.resolve(databaseManagerToken));
    });
  }
}
