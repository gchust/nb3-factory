import type { ApiClient } from '@nocobase/app-client';

import type { FileRecord } from '@/extensions/nocobase-file-component-ui';

export type MediaType = 'image' | 'audio' | 'video' | 'document';
export type AssetStatus = 'available' | 'disabled';

export const MEDIA_TYPES: readonly MediaType[] = [
  'image',
  'audio',
  'video',
  'document',
];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// The server is the authority; this list only tells the user what is accepted.
export const ACCEPTED_EXTENSIONS: readonly string[] = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'mp3',
  'wav',
  'mp4',
  'webm',
  'pdf',
  'txt',
  'md',
];

export interface MediaAsset {
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

export interface MediaAccess {
  authenticated: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isGuest: boolean;
  canManage: boolean;
  canDownload: boolean;
}

export interface AssetPage {
  items: MediaAsset[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AssetStatsEntry {
  type: MediaType;
  count: number;
  totalSize: number;
}

export interface AssetStats {
  items: AssetStatsEntry[];
  totalCount: number;
  totalSize: number;
}

export interface AssetFilters {
  type?: string;
  tag?: string;
  name?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchAccess(api: ApiClient): Promise<MediaAccess> {
  const { data } = await api.request<{ data: MediaAccess }>({
    path: '/media/access',
  });
  return data;
}

export async function fetchAssets(
  api: ApiClient,
  filters: AssetFilters,
): Promise<AssetPage> {
  const { data } = await api.request<{ data: AssetPage }>({
    path: '/media/assets',
    query: {
      type: filters.type,
      tag: filters.tag,
      name: filters.name,
      page: filters.page,
      pageSize: filters.pageSize,
    },
  });
  return data;
}

export async function fetchAsset(
  api: ApiClient,
  id: string,
): Promise<MediaAsset> {
  const { data } = await api.request<{ data: MediaAsset }>({
    path: `/media/assets/${encodeURIComponent(id)}`,
  });
  return data;
}

export async function createAsset(
  api: ApiClient,
  input: { fileId: string; name: string; tags?: string },
): Promise<MediaAsset> {
  const { data } = await api.request<{ data: MediaAsset }>({
    path: '/media/assets',
    method: 'POST',
    json: input,
  });
  return data;
}

export async function updateAsset(
  api: ApiClient,
  id: string,
  input: { name?: string; tags?: string; status?: AssetStatus },
): Promise<MediaAsset> {
  const { data } = await api.request<{ data: MediaAsset }>({
    path: `/media/assets/${encodeURIComponent(id)}`,
    method: 'PATCH',
    json: input,
  });
  return data;
}

export async function fetchStats(api: ApiClient): Promise<AssetStats> {
  const { data } = await api.request<{ data: AssetStats }>({
    path: '/media/stats',
  });
  return data;
}

/** Maps the server's error code to a translation key; unknown codes fall back to the message. */
export function mediaErrorKey(code: string | undefined): string | undefined {
  switch (code) {
    case 'TYPE_NOT_ALLOWED':
      return 'media.error.typeNotAllowed';
    case 'MIME_NOT_ALLOWED':
      return 'media.error.mimeNotAllowed';
    case 'MEDIA_FILE_TOO_LARGE':
      return 'media.error.tooLarge';
    case 'FILE_NOT_FOUND':
      return 'media.error.fileNotFound';
    case 'FILE_ALREADY_LINKED':
      return 'media.error.fileAlreadyLinked';
    case 'INVALID_NAME':
      return 'media.error.invalidName';
    case 'INVALID_STATUS':
      return 'media.error.invalidStatus';
    case 'MEDIA_NOT_FOUND':
      return 'media.error.notFound';
    case 'MEDIA_FORBIDDEN':
      return 'media.error.forbidden';
    default:
      return undefined;
  }
}

export function detectMediaType(filename: string): MediaType | undefined {
  const ext = extension(filename);
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  if (['mp3', 'wav'].includes(ext)) return 'audio';
  if (['mp4', 'webm'].includes(ext)) return 'video';
  if (['pdf', 'txt', 'md'].includes(ext)) return 'document';
  return undefined;
}

export function extension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot + 1).toLowerCase();
}

export function formatSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** Tags edited as a comma-separated string, which is what the API accepts. */
export function tagsToInput(tags: readonly string[]): string {
  return tags.join(', ');
}

/**
 * The File plugin's UI components read `FileRecord`. Only id, filename, ext, mimeType, size and
 * contentUrl are used for rendering; disk and key are carried for type compatibility.
 */
export function toFileRecord(asset: MediaAsset): FileRecord {
  return {
    id: asset.fileId,
    disk: '',
    key: asset.fileId,
    filename: asset.filename,
    ext: asset.ext,
    mimeType: asset.mimeType,
    size: asset.size,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    ...(asset.contentUrl ? { contentUrl: asset.contentUrl } : {}),
  };
}
