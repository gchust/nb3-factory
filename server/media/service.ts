import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  classifyMediaFile,
  isAssetStatus,
  isMediaType,
  normalizeSize,
  normalizeTags,
  tagsFromStored,
  type AssetStatus,
  type MediaType,
} from './allowed-types.js';

const SYSTEM_ADMINISTRATOR = 'system-administrator';
const MEDIA_MANAGER = 'media-manager';
const MEDIA_MEMBER = 'media-member';
const MEDIA_GUEST = 'media-guest';

const FILE_COLLECTION = 'mediaFiles';
const ASSET_COLLECTION = 'mediaAssets';

export interface MediaAccess {
  readonly authenticated: boolean;
  readonly isAdmin: boolean;
  readonly isManager: boolean;
  readonly isGuest: boolean;
  /** May upload, edit and disable assets. */
  readonly canManage: boolean;
  /** May download and fetch file content. Guests may not. */
  readonly canDownload: boolean;
}

export interface MediaAssetDto {
  id: string;
  name: string;
  type: MediaType;
  tags: string[];
  status: AssetStatus;
  fileId: string;
  filename: string;
  mimeType: string;
  ext: string;
  size: number;
  uploaderId: string | null;
  uploaderName: string | null;
  createdAt: string;
  updatedAt: string;
  contentUrl?: string;
}

export interface MediaFileRecord {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
}

export interface ListAssetsInput {
  readonly type?: string;
  readonly tag?: string;
  readonly name?: string;
  readonly page?: number | string;
  readonly pageSize?: number | string;
}

export interface CreateAssetInput {
  readonly fileId?: unknown;
  readonly name?: unknown;
  readonly tags?: unknown;
}

export interface UpdateAssetInput {
  readonly name?: unknown;
  readonly tags?: unknown;
  readonly status?: unknown;
}

export interface AssetStatsEntry {
  readonly type: MediaType;
  readonly count: number;
  readonly totalSize: number;
}

export interface AssetStats {
  readonly items: readonly AssetStatsEntry[];
  readonly totalCount: number;
  readonly totalSize: number;
}

export type MediaErrorCode =
  | 'TYPE_NOT_ALLOWED'
  | 'MIME_NOT_ALLOWED'
  | 'FILE_NOT_FOUND'
  | 'FILE_ALREADY_LINKED'
  | 'INVALID_NAME'
  | 'INVALID_STATUS'
  | 'NOT_FOUND';

/** A rejected media operation. The route maps the code to a localized message and an HTTP status. */
export class MediaError extends Error {
  constructor(
    readonly code: MediaErrorCode,
    readonly status: 400 | 404 | 409,
  ) {
    super(code);
    this.name = 'MediaError';
  }
}

interface PermissionSetAssignmentLike {
  readonly subject: { readonly type: string; readonly id: string };
  readonly permissionSet: string;
}

export interface PermissionSetsLister {
  readonly permissionSets: {
    listAssignments(): Promise<readonly PermissionSetAssignmentLike[]>;
  };
}

export const mediaServiceToken: ServiceToken<MediaService> =
  createServiceToken<MediaService>('app/media-service');

export class MediaService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly authorization: PermissionSetsLister,
  ) {}

  async resolveAccess(userId: string | undefined): Promise<MediaAccess> {
    if (!userId) {
      return {
        authenticated: false,
        isAdmin: false,
        isManager: false,
        isGuest: false,
        canManage: false,
        canDownload: false,
      };
    }
    const roles = await this.rolesFor(userId);
    const isAdmin = roles.has(SYSTEM_ADMINISTRATOR);
    const isManager = isAdmin || roles.has(MEDIA_MANAGER);
    const isMember = roles.has(MEDIA_MEMBER);
    // A guest is an account explicitly given the guest role and no role that grants more.
    const isGuest = !isManager && !isMember && roles.has(MEDIA_GUEST);
    return {
      authenticated: true,
      isAdmin,
      isManager,
      isGuest,
      canManage: isManager,
      canDownload: !isGuest,
    };
  }

  async listAssets(
    input: ListAssetsInput,
    access: MediaAccess,
    basePath: string,
  ): Promise<{
    items: MediaAssetDto[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = positiveInteger(input.page, 1);
    const pageSize = Math.min(positiveInteger(input.pageSize, 24), 100);
    const withFilters = () => {
      let query = this.database.query().selectFrom(ASSET_COLLECTION);
      if (!access.canManage) query = query.where('status', '=', 'available');
      if (isMediaType(input.type)) query = query.where('type', '=', input.type);
      const name = searchTerm(input.name);
      if (name) query = query.where('name', 'like', `%${name}%`);
      const tag = searchTerm(input.tag);
      if (tag) query = query.where('tags', 'like', `%,${tag},%`);
      return query;
    };

    const countRow = await withFilters()
      .select((eb) => [eb.fn.countAll().as('count')])
      .executeTakeFirst();
    const rows = await withFilters()
      .selectAll()
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .execute();
    return {
      items: rows.map((row) => this.toDto(row, access, basePath)),
      total: normalizeSize(countRow?.count),
      page,
      pageSize,
    };
  }

  async getAsset(
    id: string,
    access: MediaAccess,
    basePath: string,
  ): Promise<MediaAssetDto | undefined> {
    const numericId = numericIdValue(id);
    if (numericId === undefined) return undefined;
    const row = await this.database
      .query()
      .selectFrom(ASSET_COLLECTION)
      .selectAll()
      .where('id', '=', numericId)
      .executeTakeFirst();
    if (!row) return undefined;
    if (!access.canManage && row.status !== 'available') return undefined;
    return this.toDto(row, access, basePath);
  }

  async assetStatusForFile(fileId: string): Promise<AssetStatus | undefined> {
    const row = await this.database
      .query()
      .selectFrom(ASSET_COLLECTION)
      .select(['status'])
      .where('fileId', '=', fileId)
      .executeTakeFirst();
    if (!row) return undefined;
    return isAssetStatus(row.status) ? row.status : 'available';
  }

  async findFile(fileId: string): Promise<MediaFileRecord | undefined> {
    const row = await this.database
      .query()
      .selectFrom(FILE_COLLECTION)
      .selectAll()
      .where('id', '=', fileId)
      .executeTakeFirst();
    if (!row) return undefined;
    return {
      id: readString(row.id),
      disk: readString(row.disk),
      key: readString(row.key),
      filename: readString(row.filename),
      ext: readString(row.ext),
      mimeType: readString(row.mimeType),
      size: normalizeSize(row.size),
    };
  }

  async createAsset(
    input: CreateAssetInput,
    uploader: { readonly id: string; readonly name?: string },
    access: MediaAccess,
    basePath: string,
  ): Promise<MediaAssetDto> {
    const fileId = typeof input.fileId === 'string' ? input.fileId : '';
    if (!fileId) throw new MediaError('FILE_NOT_FOUND', 400);
    const file = await this.findFile(fileId);
    if (!file) throw new MediaError('FILE_NOT_FOUND', 400);

    const classification = classifyMediaFile(file.filename, file.mimeType);
    if (!classification.ok) throw new MediaError(classification.code, 400);

    const existing = await this.database
      .query()
      .selectFrom(ASSET_COLLECTION)
      .select('id')
      .where('fileId', '=', fileId)
      .executeTakeFirst();
    if (existing) throw new MediaError('FILE_ALREADY_LINKED', 409);

    const name =
      typeof input.name === 'string' ? input.name.trim() : file.filename;
    if (!name) throw new MediaError('INVALID_NAME', 400);

    // Dates are stored as ISO strings, the representation the File plugin's own rows use.
    const now = new Date().toISOString();
    await this.database
      .query()
      .insertInto(ASSET_COLLECTION)
      .values({
        name,
        type: classification.type,
        tags: normalizeTags(input.tags),
        status: 'available',
        fileId,
        filename: file.filename,
        mimeType: file.mimeType,
        ext: file.ext,
        size: file.size,
        uploaderId: uploader.id,
        uploaderName: uploader.name ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const created = await this.database
      .query()
      .selectFrom(ASSET_COLLECTION)
      .selectAll()
      .where('fileId', '=', fileId)
      .executeTakeFirst();
    if (!created) throw new MediaError('FILE_NOT_FOUND', 400);
    return this.toDto(created, access, basePath);
  }

  async updateAsset(
    id: string,
    input: UpdateAssetInput,
    access: MediaAccess,
    basePath: string,
  ): Promise<MediaAssetDto | undefined> {
    const numericId = numericIdValue(id);
    if (numericId === undefined) return undefined;

    const current = await this.database
      .query()
      .selectFrom(ASSET_COLLECTION)
      .select('id')
      .where('id', '=', numericId)
      .executeTakeFirst();
    if (!current) return undefined;

    const values: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.name !== undefined) {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) throw new MediaError('INVALID_NAME', 400);
      values.name = name;
    }
    if (input.tags !== undefined) {
      values.tags = normalizeTags(input.tags);
    }
    if (input.status !== undefined) {
      if (!isAssetStatus(input.status)) {
        throw new MediaError('INVALID_STATUS', 400);
      }
      values.status = input.status;
    }

    await this.database
      .query()
      .updateTable(ASSET_COLLECTION)
      .set(values)
      .where('id', '=', numericId)
      .execute();

    const row = await this.database
      .query()
      .selectFrom(ASSET_COLLECTION)
      .selectAll()
      .where('id', '=', numericId)
      .executeTakeFirst();
    if (!row) return undefined;
    return this.toDto(row, access, basePath);
  }

  async stats(access: MediaAccess): Promise<AssetStats> {
    let query = this.database
      .query()
      .selectFrom(ASSET_COLLECTION)
      .select((eb) => [
        'type',
        eb.fn.countAll().as('count'),
        eb.fn.sum('size').as('totalSize'),
      ])
      .groupBy('type');
    if (!access.canManage) query = query.where('status', '=', 'available');
    const rows = await query.execute();

    const byType = new Map<MediaType, { count: number; totalSize: number }>();
    for (const row of rows) {
      if (!isMediaType(row.type)) continue;
      byType.set(row.type, {
        count: normalizeSize(row.count),
        totalSize: normalizeSize(row.totalSize),
      });
    }
    const items: AssetStatsEntry[] = (
      ['image', 'audio', 'video', 'document'] as const
    ).map((type) => ({
      type,
      count: byType.get(type)?.count ?? 0,
      totalSize: byType.get(type)?.totalSize ?? 0,
    }));
    return {
      items,
      totalCount: items.reduce((sum, item) => sum + item.count, 0),
      totalSize: items.reduce((sum, item) => sum + item.totalSize, 0),
    };
  }

  private async rolesFor(userId: string): Promise<Set<string>> {
    const assignments =
      await this.authorization.permissionSets.listAssignments();
    return new Set(
      assignments
        .filter(
          (assignment) =>
            assignment.subject.type === 'user' &&
            assignment.subject.id === userId,
        )
        .map((assignment) => assignment.permissionSet),
    );
  }

  private toDto(
    row: Record<string, unknown>,
    access: MediaAccess,
    basePath: string,
  ): MediaAssetDto {
    const fileId = readString(row.fileId);
    const ext = readString(row.ext);
    return {
      id: readString(row.id),
      name: readString(row.name),
      type: isMediaType(row.type) ? row.type : 'document',
      tags: tagsFromStored(row.tags),
      status: isAssetStatus(row.status) ? row.status : 'available',
      fileId,
      filename: readString(row.filename),
      mimeType: readString(row.mimeType),
      ext,
      size: normalizeSize(row.size),
      uploaderId: readNullableString(row.uploaderId),
      uploaderName: readNullableString(row.uploaderName),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
      // Guests may browse the library but not fetch file content, so no content URL is exposed.
      contentUrl: access.canDownload
        ? mediaContentUrl(basePath, fileId, ext)
        : undefined,
    };
  }
}

export function mediaContentUrl(
  basePath: string,
  fileId: string,
  ext: string,
): string {
  const prefix = (basePath ?? '').replace(/\/$/, '');
  const suffix = ext ? `.${encodeURIComponent(ext)}` : '';
  return `${prefix}/uploads/media/${encodeURIComponent(fileId)}${suffix}`;
}

export class MediaServiceProvider extends ServiceProvider<Application> {
  public readonly name = 'app/media-service';

  public override register(): void {
    const container = this.app.container;
    container.singleton(mediaServiceToken, () => {
      const database = container.resolve(databaseManagerToken);
      const authorization = container.has(authorizationToken)
        ? container.resolve(authorizationToken)
        : { permissionSets: { listAssignments: async () => [] } };
      return new MediaService(database, authorization);
    });
  }
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function numericIdValue(value: string): number | undefined {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

/** Removes LIKE wildcards so a search term is matched literally. */
function searchTerm(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[%_]/gu, '').trim();
}

function readString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : readString(value);
}
