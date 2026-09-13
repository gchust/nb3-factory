import type { Application } from '@nocobase/app-server/application';
import {
  serverFileRepositoryManagerToken,
  type ServerFileRepository,
} from '@nocobase/app-plugin-file/server';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

// The attachment collection and storage location are shared by the File plugin's routes and
// this service; keeping them in one place means both agree on the same content URL.
export const RESOURCE_FILES_COLLECTION = 'resource_files';
export const RESOURCE_FILES_DISK = 'local';
export const RESOURCE_FILES_ACCESS_PATH = '/uploads/resource-files';

export interface ResourceAttachment {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  /** Application-local path; the HTTP layer prefixes the public base path. */
  readonly contentPath: string;
}

export interface ResourceView {
  readonly id: number;
  readonly title: string;
  readonly category: string;
  readonly cover: ResourceAttachment | null;
  readonly document: ResourceAttachment | null;
  readonly createdAt: string;
}

export interface ResourceCreateInput {
  readonly title: string;
  readonly category: string;
  readonly coverFileId: string | null;
  readonly documentFileId: string | null;
}

export class ResourceCenterError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ResourceCenterError';
  }
}

export interface ResourceCenterService {
  list(): Promise<ResourceView[]>;
  get(id: number): Promise<ResourceView | undefined>;
  create(input: ResourceCreateInput): Promise<ResourceView>;
}

export const resourceCenterServiceToken: ServiceToken<ResourceCenterService> =
  createServiceToken<ResourceCenterService>('app/resource-center-service');

interface ResourceRow {
  readonly [column: string]: unknown;
  readonly id: number;
  readonly title: string;
  readonly category: string;
  readonly coverFileId: string | null;
  readonly documentFileId: string | null;
  readonly createdAt: string | Date;
}

interface FileRow {
  readonly [column: string]: unknown;
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number | bigint | string;
}

const RESOURCE_COLUMNS = [
  'id',
  'title',
  'category',
  'coverFileId',
  'documentFileId',
  'createdAt',
] as const;

const FILE_COLUMNS = ['id', 'filename', 'ext', 'mimeType', 'size'] as const;

export function createResourceCenterService(
  database: DatabaseManager,
  files: Pick<ServerFileRepository, 'getUrl'>,
): ResourceCenterService {
  const query = database.query();

  return {
    async list(): Promise<ResourceView[]> {
      const rows = await query
        .selectFrom<ResourceRow>('resources')
        .select([...RESOURCE_COLUMNS])
        .orderBy('createdAt', 'desc')
        .execute<ResourceRow>();
      return hydrate(rows, files, query);
    },

    async get(id: number): Promise<ResourceView | undefined> {
      const row = await query
        .selectFrom<ResourceRow>('resources')
        .select([...RESOURCE_COLUMNS])
        .where('id', '=', id)
        .executeTakeFirst<ResourceRow>();
      if (!row) return undefined;
      const [view] = await hydrate([row], files, query);
      return view;
    },

    async create(input: ResourceCreateInput): Promise<ResourceView> {
      const requested = [input.coverFileId, input.documentFileId].filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      );
      if (requested.length > 0) {
        const found = await query
          .selectFrom('resource_files')
          .select('id')
          .where('id', 'in', requested)
          .execute();
        if (found.length !== requested.length) {
          throw new ResourceCenterError(
            'FILE_NOT_FOUND',
            'An attachment does not exist.',
          );
        }
      }

      const now = new Date();
      const result = await query
        .insertInto('resources')
        .values({
          title: input.title,
          category: input.category,
          coverFileId: input.coverFileId,
          documentFileId: input.documentFileId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      const row = await query
        .selectFrom<ResourceRow>('resources')
        .select([...RESOURCE_COLUMNS])
        .where('id', '=', Number(result.insertId))
        .executeTakeFirstOrThrow<ResourceRow>();
      const [view] = await hydrate([row], files, query);
      return view;
    },
  };
}

async function hydrate(
  rows: readonly ResourceRow[],
  files: Pick<ServerFileRepository, 'getUrl'>,
  query: ReturnType<DatabaseManager['query']>,
): Promise<ResourceView[]> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.coverFileId) ids.add(row.coverFileId);
    if (row.documentFileId) ids.add(row.documentFileId);
  }

  const fileRows =
    ids.size > 0
      ? await query
          .selectFrom<FileRow>('resource_files')
          .select([...FILE_COLUMNS])
          .where('id', 'in', [...ids])
          .execute<FileRow>()
      : [];
  const byId = new Map(
    fileRows.map((file) => [file.id, toAttachment(file, files)] as const),
  );

  return rows.map((row) => ({
    id: Number(row.id),
    title: row.title,
    category: row.category,
    cover: row.coverFileId ? (byId.get(row.coverFileId) ?? null) : null,
    document: row.documentFileId
      ? (byId.get(row.documentFileId) ?? null)
      : null,
    createdAt: toIsoString(row.createdAt),
  }));
}

function toAttachment(
  file: FileRow,
  files: Pick<ServerFileRepository, 'getUrl'>,
): ResourceAttachment {
  return {
    id: file.id,
    filename: file.filename,
    ext: file.ext,
    mimeType: file.mimeType,
    size: Number(file.size),
    contentPath: files.getUrl({ id: file.id, ext: file.ext }),
  };
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export default class ResourceCenterProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/resource-center-provider';

  public override register(): void {
    this.app.container.singleton(resourceCenterServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const fileManager = this.app.container.resolve(
        serverFileRepositoryManagerToken,
      );
      const files = fileManager.repository(RESOURCE_FILES_COLLECTION, {
        disk: RESOURCE_FILES_DISK,
        accessPath: RESOURCE_FILES_ACCESS_PATH,
      });
      return createResourceCenterService(database, files);
    });
  }
}
