import type { Readable } from 'node:stream';

import { driveManagerToken } from '@nocobase/app-server/drive';
import type { Application } from '@nocobase/app-server/application';
import { joinBasePath } from '@nocobase/app-server/support';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Repository,
} from '@nocobase/db';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

import {
  DEMO_CORRUPTED_PHOTO,
  DEMO_SITE_DOCUMENT,
  DEMO_SITE_PHOTO,
  type DemoFixture,
} from './demo-fixtures.js';

/**
 * Domain logic for project materials (资料) and their private attachments.
 *
 * The service never sees an HTTP request or a session: it takes the authenticated user id from the
 * route and applies the ownership rule itself. Keeping the rule in one place keeps the routes thin
 * enough that a mistake there cannot widen access.
 */
export type ProjectMaterialErrorCode = 'NOT_FOUND' | 'VALIDATION';

export class ProjectMaterialError extends Error {
  readonly code: ProjectMaterialErrorCode;
  readonly status: 400 | 404 | 413 | 415;

  constructor(
    code: ProjectMaterialErrorCode,
    message: string,
    status: 400 | 404 | 413 | 415,
  ) {
    super(message);
    this.name = 'ProjectMaterialError';
    this.code = code;
    this.status = status;
  }
}

export interface ProjectMaterialFileRecord {
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

export interface ProjectMaterialRecord {
  readonly id: string;
  readonly title: string;
  readonly createdById: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly files: ProjectMaterialFileRecord[];
}

export interface ProjectMaterialInput {
  readonly title?: unknown;
  readonly fileIds?: unknown;
}

interface MaterialRow {
  id: string;
  title: string;
  createdById: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface FileRow {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number | string;
  ownerId: string;
  materialId: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ProjectMaterialServiceOptions {
  readonly database: DatabaseManager;
  readonly drive: NocoBaseDriveManager;
  /** Base URL of the API, including the deployment base path, e.g. `/main/api`. */
  readonly publicApiUrl: string;
  readonly connection?: string;
}

const MAX_TITLE_LENGTH = 255;

export class ProjectMaterialService {
  private readonly database: DatabaseManager;
  private readonly drive: NocoBaseDriveManager;
  private readonly publicApiUrl: string;
  private readonly connection: string | undefined;

  constructor(options: ProjectMaterialServiceOptions) {
    this.database = options.database;
    this.drive = options.drive;
    this.publicApiUrl = options.publicApiUrl;
    this.connection = options.connection;
  }

  private materials(): MaterialRepository {
    return this.database.repository<MaterialRow>(
      'projectMaterials',
      this.connection,
    );
  }

  private files(): FileRepository {
    return this.database.repository<FileRow>(
      'projectMaterialFiles',
      this.connection,
    );
  }

  /**
   * Every material the user owns, newest first, with its linked attachments.
   */
  async list(userId: string): Promise<ProjectMaterialRecord[]> {
    const materials = await this.materials().findMany({
      filter: { createdById: userId },
      sort: (sort) => sort.field('createdAt').desc(),
    });
    if (materials.length === 0) return [];

    // Attachments are found by grouping the user's files. A filter shorthand has no `in` operator,
    // and one grouped read is both simpler and cheaper than one query per material.
    const files = await this.files().findMany({ filter: { ownerId: userId } });
    const byMaterial = new Map<string, FileRow[]>();
    for (const file of files) {
      if (!file.materialId) continue;
      const bucket = byMaterial.get(file.materialId);
      if (bucket) bucket.push(file);
      else byMaterial.set(file.materialId, [file]);
    }

    return materials.map((material) =>
      this.toMaterialRecord(material, byMaterial.get(material.id) ?? []),
    );
  }

  /**
   * One material the user owns. A record owned by somebody else is reported as missing rather than
   * forbidden, so the response cannot confirm that it exists.
   */
  async get(userId: string, id: string): Promise<ProjectMaterialRecord> {
    const material = await this.materials().findOne({
      filter: { id, createdById: userId },
    });
    if (!material) throw notFound();

    const files = await this.files().findMany({
      filter: { materialId: id, ownerId: userId },
    });
    return this.toMaterialRecord(material, files);
  }

  /**
   * Create a material and attach the files the user already uploaded. The attachments are uploaded
   * before this call, which is what lets a user whose save failed because the title was missing fill
   * it in and save again without uploading the files a second time.
   */
  async create(
    userId: string,
    input: ProjectMaterialInput,
  ): Promise<ProjectMaterialRecord> {
    const title = normalizeTitle(input.title);
    const fileIds = normalizeFileIds(input.fileIds);

    return this.database.transaction(async (connection) => {
      const materials = connection.repository<
        MaterialRow,
        Partial<MaterialRow>,
        Partial<MaterialRow>
      >('projectMaterials');
      const files = connection.repository<
        FileRow,
        Partial<FileRow>,
        Partial<FileRow>
      >('projectMaterialFiles');
      await assertFilesUsable(files, userId, fileIds, null);

      const now = new Date();
      const created = await materials.createOne({
        values: {
          id: crypto.randomUUID(),
          title,
          createdById: userId,
          createdAt: now,
          updatedAt: now,
        },
      });
      const materialId = created.record.id;
      for (const fileId of fileIds) {
        await files.updateOne({
          filter: { id: fileId, ownerId: userId },
          values: { materialId, updatedAt: now },
        });
      }

      const linked = await files.findMany({
        filter: { materialId, ownerId: userId },
      });
      return this.toMaterialRecord(created.record, linked);
    });
  }

  /**
   * Update a material. A supplied `fileIds` is the complete desired set: files no longer in it are
   * unlinked, which is how removing an attachment on save takes it out of the material without
   * deleting it.
   */
  async update(
    userId: string,
    id: string,
    input: ProjectMaterialInput,
  ): Promise<ProjectMaterialRecord> {
    const hasTitle = input.title !== undefined;
    const hasFiles = input.fileIds !== undefined;
    const title = hasTitle ? normalizeTitle(input.title) : undefined;
    const desiredFileIds = hasFiles
      ? normalizeFileIds(input.fileIds)
      : undefined;

    await this.database.transaction(async (connection) => {
      const materials = connection.repository<
        MaterialRow,
        Partial<MaterialRow>,
        Partial<MaterialRow>
      >('projectMaterials');
      const files = connection.repository<
        FileRow,
        Partial<FileRow>,
        Partial<FileRow>
      >('projectMaterialFiles');

      const material = await materials.findOne({
        filter: { id, createdById: userId },
      });
      if (!material) throw notFound();

      const now = new Date();
      if (title !== undefined) {
        await materials.updateOne({
          filter: { id, createdById: userId },
          values: { title, updatedAt: now },
        });
      }

      if (desiredFileIds !== undefined) {
        await assertFilesUsable(files, userId, desiredFileIds, id);
        const desired = new Set(desiredFileIds);
        const current = await files.findMany({
          filter: { materialId: id, ownerId: userId },
        });
        for (const file of current) {
          if (!desired.has(file.id)) {
            await files.updateOne({
              filter: { id: file.id, ownerId: userId },
              values: { materialId: null, updatedAt: now },
            });
          }
        }
        for (const fileId of desiredFileIds) {
          await files.updateOne({
            filter: { id: fileId, ownerId: userId },
            values: { materialId: id, updatedAt: now },
          });
        }
      }
    });

    return this.get(userId, id);
  }

  /**
   * Delete a material. Its attachments are unlinked, not deleted: they belong to the user, and the
   * application keeps file history rather than offering a recycle bin.
   */
  async remove(userId: string, id: string): Promise<void> {
    await this.database.transaction(async (connection) => {
      const materials = connection.repository<
        MaterialRow,
        Partial<MaterialRow>,
        Partial<MaterialRow>
      >('projectMaterials');
      const files = connection.repository<
        FileRow,
        Partial<FileRow>,
        Partial<FileRow>
      >('projectMaterialFiles');
      const material = await materials.findOne({
        filter: { id, createdById: userId },
      });
      if (!material) throw notFound();

      await files.updateMany({
        filter: { materialId: id, ownerId: userId },
        values: { materialId: null, updatedAt: new Date() },
      });
      await materials.deleteOne({ filter: { id, createdById: userId } });
    });
  }

  /**
   * Read one attachment the user owns. The ownership check is the whole point: another contributor
   * holding the exact URL is refused, and an anonymous request never reaches here because the route
   * authenticates first.
   */
  async openAttachment(
    userId: string,
    fileId: string,
  ): Promise<{ file: ProjectMaterialFileRecord; stream: Readable }> {
    const file = await this.files().findOne({ filter: { id: fileId } });
    if (!file || file.ownerId !== userId) throw notFound();

    const disk = this.drive.use(file.disk);
    if (!(await disk.exists(file.key))) throw notFound();

    return {
      file: this.toFileRecord(file),
      stream: await disk.getStream(file.key),
    };
  }

  /**
   * The URL an attachment is served from. It includes the deployment base path, because the browser
   * resolves it against the current page and the application may be mounted anywhere.
   */
  attachmentContentUrl(id: string, ext: string): string {
    const base = joinBasePath(this.publicApiUrl, '/project-material-files');
    return `${base}/${encodeURIComponent(id)}${ext ? `.${ext}` : ''}`;
  }

  private toMaterialRecord(
    material: MaterialRow,
    files: readonly FileRow[],
  ): ProjectMaterialRecord {
    return {
      id: material.id,
      title: material.title,
      createdById: material.createdById,
      createdAt: serializeTemporal(material.createdAt),
      updatedAt: serializeTemporal(material.updatedAt),
      files: files.map((file) => this.toFileRecord(file)),
    };
  }

  private toFileRecord(file: FileRow): ProjectMaterialFileRecord {
    return {
      id: file.id,
      disk: file.disk,
      key: file.key,
      filename: file.filename,
      ext: file.ext,
      mimeType: file.mimeType,
      size: typeof file.size === 'string' ? Number(file.size) : file.size,
      createdAt: serializeTemporal(file.createdAt),
      updatedAt: serializeTemporal(file.updatedAt),
      contentUrl: this.attachmentContentUrl(file.id, file.ext),
    };
  }
}

type MaterialRepository = Repository<
  MaterialRow,
  Partial<MaterialRow>,
  Partial<MaterialRow>
>;

type FileRepository = Repository<FileRow, Partial<FileRow>, Partial<FileRow>>;

async function assertFilesUsable(
  files: FileRepository,
  userId: string,
  fileIds: readonly string[],
  materialId: string | null,
): Promise<void> {
  for (const fileId of fileIds) {
    const file = await files.findOne({ filter: { id: fileId } });
    if (!file || file.ownerId !== userId) {
      throw new ProjectMaterialError('NOT_FOUND', 'Attachment not found.', 404);
    }
    if (file.materialId && file.materialId !== materialId) {
      throw new ProjectMaterialError(
        'VALIDATION',
        'Attachment already belongs to another material.',
        400,
      );
    }
  }
}

function normalizeTitle(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ProjectMaterialError('VALIDATION', 'A title is required.', 400);
  }
  const title = value.trim();
  if (title.length > MAX_TITLE_LENGTH) {
    throw new ProjectMaterialError(
      'VALIDATION',
      `The title may be at most ${MAX_TITLE_LENGTH} characters.`,
      400,
    );
  }
  return title;
}

function normalizeFileIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ProjectMaterialError(
      'VALIDATION',
      'fileIds must be an array of attachment ids.',
      400,
    );
  }
  const ids = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new ProjectMaterialError(
        'VALIDATION',
        'fileIds must contain attachment ids.',
        400,
      );
    }
    ids.add(entry.trim());
  }
  return [...ids];
}

function notFound(): ProjectMaterialError {
  return new ProjectMaterialError('NOT_FOUND', 'Material not found.', 404);
}

function serializeTemporal(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value instanceof Date ? value.toISOString() : value;
}

export const projectMaterialServiceToken =
  createServiceToken<ProjectMaterialService>('projectMaterialService');

/**
 * Binds the service and provisions the demo attachment bytes.
 *
 * Bytes cannot be written by the seed: a seed runs inside the database task container, whose
 * allowlist exposes only the id generator, so the drive is not resolvable there. `start()` runs after
 * `DatabaseProvider.boot()` has applied migrations and seeds, which is the first moment the seeded
 * rows and the drive both exist.
 */
export class ProjectMaterialServiceProvider extends ServiceProvider<Application> {
  name = 'projectMaterialService';

  register(): void {
    this.app.container.singleton(
      projectMaterialServiceToken,
      () =>
        new ProjectMaterialService({
          database: this.app.container.resolve(databaseManagerToken),
          drive: this.app.container.resolve(driveManagerToken),
          publicApiUrl: joinBasePath(this.app.publicBasePath, '/api'),
        }),
    );
  }

  async start(): Promise<void> {
    await provisionDemoAttachmentBytes(
      this.app.container.resolve(databaseManagerToken),
      this.app.container.resolve(driveManagerToken),
    );
  }
}

const DEMO_ATTACHMENTS: ReadonlyArray<{
  readonly id: string;
  readonly fixture: DemoFixture;
}> = [
  { id: '1a7d3f20-9c2b-4e51-8a6d-0f4b7c1e9d11', fixture: DEMO_SITE_PHOTO },
  { id: '1a7d3f20-9c2b-4e51-8a6d-0f4b7c1e9d12', fixture: DEMO_SITE_DOCUMENT },
  {
    id: '1a7d3f20-9c2b-4e51-8a6d-0f4b7c1e9d13',
    fixture: DEMO_CORRUPTED_PHOTO,
  },
];

/**
 * Writes the seeded attachment bytes if they are not on the disk yet. Idempotent: it only writes a
 * missing object, so it is safe on every start and never overwrites a user's upload.
 */
export async function provisionDemoAttachmentBytes(
  database: DatabaseManager,
  drive: NocoBaseDriveManager,
): Promise<void> {
  // An embedded host may run without the application's migrations — the collection is then absent,
  // there are no demo rows, and there is nothing to provision. Reading the registry first says so
  // plainly instead of letting the repository throw during startup.
  const collection = await database.collections().get('projectMaterialFiles');
  if (!collection) return;

  const files = database.repository<
    { id: string; disk: string; key: string },
    Partial<{ id: string; disk: string; key: string }>,
    Partial<{ id: string; disk: string; key: string }>
  >('projectMaterialFiles');

  for (const attachment of DEMO_ATTACHMENTS) {
    const row = await files.findOne({ filter: { id: attachment.id } });
    if (!row) continue;
    const disk = drive.use(row.disk);
    if (await disk.exists(row.key)) continue;
    await disk.put(row.key, Buffer.from(attachment.fixture.base64, 'base64'));
  }
}
