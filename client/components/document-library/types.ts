/**
 * Shapes shared by the document library pages. The values mirror what `server/routes/documents.ts` returns; the
 * server remains the source of truth for the limits, the type whitelist and the disciplines.
 */

export interface DocumentRecord {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly contentUrl: string;
  readonly drawingNumber: string | null;
  readonly name: string | null;
  readonly discipline: string | null;
  readonly version: string | null;
  readonly status: string | null;
  readonly uploadedById: string | null;
  readonly uploadedByName: string | null;
  readonly uploadedAt: string | null;
  readonly createdAt: string | null;
}

export interface DocumentLimits {
  readonly maxFileBytes: number;
  readonly maxBatchBytes: number;
  readonly maxFiles: number;
}

export interface DocumentCapabilities {
  readonly canRead: boolean;
  readonly canUpload: boolean;
  readonly canUpdate: boolean;
  readonly canDelete: boolean;
  readonly canDownload: boolean;
  readonly limits: DocumentLimits;
  readonly extensions: readonly string[];
  readonly disciplines: readonly string[];
  readonly statuses: readonly string[];
}

export interface DocumentDisciplineStat {
  readonly discipline: string;
  readonly count: number;
  readonly totalSize: number;
}

export interface DocumentStats {
  readonly groups: readonly DocumentDisciplineStat[];
  readonly total: { readonly count: number; readonly totalSize: number };
}

export interface DocumentFilters {
  readonly discipline?: string;
  readonly drawingNumber?: string;
  readonly name?: string;
}

/** Used before the capabilities request resolves, so the uploader can validate immediately. */
export const FALLBACK_CAPABILITIES: DocumentCapabilities = {
  canRead: true,
  canUpload: false,
  canUpdate: false,
  canDelete: false,
  canDownload: false,
  limits: {
    maxFileBytes: 10 * 1024 * 1024,
    maxBatchBytes: 25 * 1024 * 1024,
    maxFiles: 5,
  },
  extensions: ['pdf', 'dwg', 'docx', 'xlsx', 'png'],
  disciplines: ['architecture', 'structure', 'mechanical-electrical', 'hvac'],
  statuses: ['active', 'obsolete'],
};

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot <= 0 ? '' : filename.slice(dot + 1).toLowerCase();
}

export function isPdf(
  record: Pick<DocumentRecord, 'ext' | 'mimeType'>,
): boolean {
  return record.ext === 'pdf' || record.mimeType === 'application/pdf';
}

export function isImage(
  record: Pick<DocumentRecord, 'ext' | 'mimeType'>,
): boolean {
  return record.mimeType.startsWith('image/');
}

export function canPreviewInPage(
  record: Pick<DocumentRecord, 'ext' | 'mimeType'>,
): boolean {
  return isPdf(record) || isImage(record);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function fileTypeLabel(record: Pick<DocumentRecord, 'ext'>): string {
  return record.ext ? record.ext.toUpperCase() : '—';
}
