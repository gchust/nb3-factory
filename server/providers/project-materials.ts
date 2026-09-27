import {
  type DatabaseManager,
  type Repository,
  databaseManagerToken,
} from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';

/**
 * Logical names of the two Collections behind "项目资料与私有附件", and the
 * file exposure the browser talks to. Shared by the business routes, the file
 * access guard and the client so the same strings are not spelled twice.
 */
export const PROJECT_MATERIALS_COLLECTION = 'projectMaterials';
export const PROJECT_MATERIAL_FILES_COLLECTION = 'projectMaterialFiles';
/** File exposure name: the client repository name and the `<name>:uploadOne` action. */
export const PROJECT_MATERIAL_FILES_RESOURCE = 'projectMaterialFiles';
/** Root path the file plugin serves attachment bytes from. */
export const PROJECT_MATERIAL_FILES_ACCESS_PATH = '/project-material-files';

export const projectMaterialsServiceToken =
  createServiceToken<ProjectMaterialsService>('project-materials');

export type ProjectMaterialInputErrorCode =
  'TITLE_REQUIRED' | 'TITLE_TOO_LONG' | 'INVALID_FILE_IDS';

/**
 * A rejected business input. Carries a stable `code` so the browser can show a
 * localized message instead of the server's English fallback.
 */
export class ProjectMaterialInputError extends Error {
  constructor(
    readonly code: ProjectMaterialInputErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectMaterialInputError';
  }
}

export interface ProjectMaterialRecord {
  id: string;
  title: string;
  ownerId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ProjectMaterialFileRecord {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number | string;
  createdAt: Date | string;
  updatedAt: Date | string;
  ownerId: string;
  materialId: string | null;
}

export interface ProjectMaterialAttachment {
  id: string;
  disk: string;
  key: string;
  filename: string;
  mimeType: string;
  ext: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  contentUrl: string;
}

export interface ProjectMaterialView {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  attachments: ProjectMaterialAttachment[];
}

export interface ProjectMaterialInput {
  title?: unknown;
  fileIds?: unknown;
}

const MAX_TITLE_LENGTH = 255;

function parseTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ProjectMaterialInputError(
      'TITLE_REQUIRED',
      'A material title is required.',
    );
  }
  const title = value.trim();
  if (!title) {
    throw new ProjectMaterialInputError(
      'TITLE_REQUIRED',
      'A material title is required.',
    );
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new ProjectMaterialInputError(
      'TITLE_TOO_LONG',
      `A material title may be at most ${MAX_TITLE_LENGTH} characters.`,
    );
  }
  return title;
}

function parseFileIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) {
    throw new ProjectMaterialInputError(
      'INVALID_FILE_IDS',
      'Attachments must be a list of file identifiers.',
    );
  }
  return [...new Set(value as string[])];
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toAttachment(
  file: ProjectMaterialFileRecord,
  publicBasePath: string,
): ProjectMaterialAttachment {
  const id = String(file.id);
  const ext = typeof file.ext === 'string' ? file.ext : '';
  const suffix = ext ? `.${encodeURIComponent(ext)}` : '';
  return {
    id,
    disk: String(file.disk),
    key: String(file.key),
    filename: String(file.filename),
    mimeType: String(file.mimeType),
    ext,
    size: Number(file.size),
    createdAt: toIso(file.createdAt),
    updatedAt: toIso(file.updatedAt),
    contentUrl: `${publicBasePath}${PROJECT_MATERIAL_FILES_ACCESS_PATH}/${encodeURIComponent(id)}${suffix}`,
  };
}

/**
 * Material and attachment domain logic, scoped by the signed-in user.
 *
 * Every read filters on `ownerId` and every write only touches rows the caller
 * already owns, so a material is only ever visible to the account that created
 * it. Attachments are stamped with the uploader at upload time (see the file
 * exposure policy) and are re-checked here on attach, so one user cannot pull
 * another user's upload into their own material by guessing its id.
 */
export class ProjectMaterialsService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly publicBasePath: string,
  ) {}

  private materials(): Repository<ProjectMaterialRecord> {
    return this.database.repository<ProjectMaterialRecord>(
      PROJECT_MATERIALS_COLLECTION,
    );
  }

  private files(): Repository<ProjectMaterialFileRecord> {
    return this.database.repository<ProjectMaterialFileRecord>(
      PROJECT_MATERIAL_FILES_COLLECTION,
    );
  }

  private toView(
    record: ProjectMaterialRecord,
    files: ProjectMaterialFileRecord[],
  ): ProjectMaterialView {
    return {
      id: String(record.id),
      title: String(record.title),
      createdAt: toIso(record.createdAt),
      updatedAt: toIso(record.updatedAt),
      attachments: files.map((file) => toAttachment(file, this.publicBasePath)),
    };
  }

  async list(userId: string): Promise<ProjectMaterialView[]> {
    const materials = await this.materials().findMany({
      filter: { ownerId: userId },
      sort: (sort) => sort.field('createdAt').desc(),
    });
    const files = await this.files().findMany({
      filter: { ownerId: userId },
    });
    const byMaterial = new Map<string, ProjectMaterialFileRecord[]>();
    for (const file of files) {
      if (!file.materialId) continue;
      const key = String(file.materialId);
      const group = byMaterial.get(key);
      if (group) group.push(file);
      else byMaterial.set(key, [file]);
    }
    return materials.map((record) =>
      this.toView(record, byMaterial.get(String(record.id)) ?? []),
    );
  }

  async get(
    userId: string,
    id: string,
  ): Promise<ProjectMaterialView | undefined> {
    const record = await this.materials().findOne({
      filter: { id, ownerId: userId },
    });
    if (!record) return undefined;
    const files = await this.files().findMany({
      filter: { ownerId: userId, materialId: id },
    });
    return this.toView(record, files);
  }

  async create(
    userId: string,
    input: ProjectMaterialInput,
  ): Promise<ProjectMaterialView> {
    // Validate before writing anything: a save without a title must not attach
    // the uploaded files, so the browser can retry with the same uploads.
    const title = parseTitle(input.title);
    const fileIds = parseFileIds(input.fileIds);

    const id = crypto.randomUUID();
    const now = new Date();
    await this.materials().createOne({
      values: { id, title, ownerId: userId, createdAt: now, updatedAt: now },
    });
    await this.attach(userId, id, fileIds, now);
    const view = await this.get(userId, id);
    // The material was created in this call, so it exists.
    return view as ProjectMaterialView;
  }

  async update(
    userId: string,
    id: string,
    input: ProjectMaterialInput,
  ): Promise<ProjectMaterialView | undefined> {
    const existing = await this.materials().findOne({
      filter: { id, ownerId: userId },
    });
    if (!existing) return undefined;

    const now = new Date();
    const values: Partial<ProjectMaterialRecord> = { updatedAt: now };
    if (input.title !== undefined) values.title = parseTitle(input.title);
    const fileIds =
      input.fileIds === undefined ? undefined : parseFileIds(input.fileIds);

    await this.materials().updateOne({
      filter: { id, ownerId: userId },
      values,
    });

    if (fileIds) {
      // Saving an edit replaces the attachment set: detach what is no longer
      // listed, then attach the listed files. Removal only clears the link; it
      // never deletes the stored bytes, matching "移除即解除关联，不做回收站".
      await this.files().updateMany({
        filter: { ownerId: userId, materialId: id },
        values: { materialId: null, updatedAt: now },
      });
      await this.attach(userId, id, fileIds, now);
    }

    return this.get(userId, id);
  }

  private async attach(
    userId: string,
    materialId: string,
    fileIds: readonly string[],
    now: Date,
  ): Promise<void> {
    for (const fileId of fileIds) {
      await this.files().updateMany({
        filter: { id: fileId, ownerId: userId },
        values: { materialId, updatedAt: now },
      });
    }
  }
}

export class ProjectMaterialsProvider extends ServiceProvider<Application> {
  readonly name = '@nocobase/app-project-materials';

  register(): void {
    const app = this.app;
    app.container.singleton(projectMaterialsServiceToken, (container) => {
      return new ProjectMaterialsService(
        container.resolve(databaseManagerToken),
        app.publicBasePath,
      );
    });
  }
}
