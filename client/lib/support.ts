import type { ApiClient } from '@nocobase/app-client';

import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_BYTES,
} from './support-constants.js';

export interface TicketSummary {
  readonly id: number;
  readonly number: string;
  readonly customerId: string;
  readonly customerName: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly priority: string;
  readonly status: string;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attachmentCount: number;
}

export interface AttachmentSummary {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly ticketId: number | null;
  readonly uploadedById: string | null;
  readonly uploaderName: string | null;
  readonly uploaderRole: string | null;
}

export type TicketStatusAction =
  'start' | 'request-confirmation' | 'confirm' | 'reopen';

export interface TicketDetail {
  readonly ticket: TicketSummary;
  readonly attachments: readonly AttachmentSummary[];
  readonly actions: readonly TicketStatusAction[];
}

export interface TicketStats {
  readonly total: number;
  readonly byStatus: readonly { key: string; count: number }[];
  readonly byPriority: readonly { key: string; count: number }[];
}

export interface CreateTicketInput {
  readonly title: string;
  readonly description: string;
  readonly priority: string;
}

interface Envelope<TData> {
  readonly data: TData;
}

export async function fetchTickets(
  api: ApiClient,
): Promise<readonly TicketSummary[]> {
  const payload = await api.request<Envelope<readonly TicketSummary[]>>({
    path: 'support/tickets',
  });
  return payload.data;
}

export async function createTicket(
  api: ApiClient,
  input: CreateTicketInput,
): Promise<TicketSummary> {
  const payload = await api.request<Envelope<TicketSummary>>({
    path: 'support/tickets',
    method: 'POST',
    json: {
      title: input.title,
      description: input.description || undefined,
      priority: input.priority,
    },
  });
  return payload.data;
}

export async function fetchTicketDetail(
  api: ApiClient,
  id: number,
): Promise<TicketDetail> {
  const payload = await api.request<Envelope<TicketDetail>>({
    path: `support/tickets/${id}`,
  });
  return payload.data;
}

export async function uploadAttachments(
  api: ApiClient,
  ticketId: number,
  files: readonly File[],
): Promise<readonly AttachmentSummary[]> {
  const body = new FormData();
  for (const file of files) body.append('file', file);
  const payload = await api.request<Envelope<readonly AttachmentSummary[]>>({
    path: `support/tickets/${ticketId}/attachments`,
    method: 'POST',
    body,
  });
  return payload.data;
}

export async function changeTicketStatus(
  api: ApiClient,
  id: number,
  action: TicketStatusAction,
): Promise<TicketSummary> {
  const payload = await api.request<Envelope<TicketSummary>>({
    path: `support/tickets/${id}/status`,
    method: 'POST',
    json: { action },
  });
  return payload.data;
}

export async function fetchTicketStats(api: ApiClient): Promise<TicketStats> {
  const payload = await api.request<Envelope<TicketStats>>({
    path: 'support/stats',
  });
  return payload.data;
}

/**
 * Download through the authenticated API client rather than a plain link, so
 * the session cookie travels with the request and a 401/403 surfaces as an
 * error instead of a broken tab.
 */
export async function downloadAttachment(
  api: ApiClient,
  attachment: Pick<AttachmentSummary, 'id' | 'filename'>,
): Promise<void> {
  const stream = await api.stream({
    path: `support/attachments/${attachment.id}/content`,
  });
  const blob = await new Response(stream).blob();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = attachment.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Client-side validation mirroring the server rules. */
export function validateLocalFile(
  file: Pick<File, 'name' | 'size'>,
):
  | { ok: true }
  | { ok: false; code: 'UNSUPPORTED_FILE_TYPE' | 'FILE_TOO_LARGE' } {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, code: 'FILE_TOO_LARGE' };
  }
  const dot = file.name.lastIndexOf('.');
  const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  if (
    !extension ||
    !(ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(extension)
  ) {
    return { ok: false, code: 'UNSUPPORTED_FILE_TYPE' };
  }
  return { ok: true };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** Translation key for a server error code, so messages stay localized. */
export function supportErrorKey(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  return `support.errors.${typeof code === 'string' ? code : 'UNKNOWN'}`;
}
