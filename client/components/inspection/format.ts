export const TASK_STATUSES = ['pending', 'in_progress', 'submitted'] as const;
export const REPAIR_STATUSES = [
  'pending',
  'processing',
  'review',
  'closed',
  'returned',
] as const;
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const EQUIPMENT_STATUSES = [
  'running',
  'idle',
  'maintenance',
  'retired',
] as const;

export function taskStatusKey(status: string): string {
  return `inspection.taskStatus.${status}`;
}

export function repairStatusKey(status: string): string {
  return `inspection.repairStatus.${status}`;
}

export function priorityKey(priority: string): string {
  return `inspection.priority.${priority}`;
}

export function equipmentStatusKey(status: string): string {
  return `inspection.equipmentStatus.${status}`;
}

export function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size < 0) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isImage(mimeType: string, ext: string): boolean {
  if (mimeType.startsWith('image/')) return true;
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(
    ext.toLowerCase(),
  );
}

export function isPreviewableText(mimeType: string, ext: string): boolean {
  if (mimeType.startsWith('text/')) return true;
  return ['txt', 'md', 'csv', 'json', 'log'].includes(ext.toLowerCase());
}

export function isPdf(mimeType: string, ext: string): boolean {
  return mimeType === 'application/pdf' || ext.toLowerCase() === 'pdf';
}
