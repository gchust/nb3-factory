import {
  ApiClientError,
  resolveAppUrl,
  useApiClient,
  useToaster,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useReducer, useState } from 'react';

export type QueryValue = string | number | boolean | undefined;

export interface ServiceListResult<T> {
  readonly data: T[] | undefined;
  readonly error: unknown;
  readonly loading: boolean;
  readonly reload: () => void;
}

/**
 * Loads a list endpoint once per `queryKey`. Callers pass a `useMemo`-stable
 * `query` whose fields are the same values that make up `queryKey`, so the
 * request identity and the effect's dependencies stay in step.
 */
export function useServiceList<T>(
  path: string,
  query: Record<string, QueryValue> | undefined,
  queryKey: string,
): ServiceListResult<T> {
  const api = useApiClient();
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = `${path}|${queryKey}|${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly data?: T[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${path}|${queryKey}|${reloadCount}`;
    api.request<{ data: T[] }>({ path, query, signal: controller.signal }).then(
      ({ data }) => {
        if (!controller.signal.aborted) setResult({ key, data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, path, query, queryKey, reloadCount]);

  const loading = result?.key !== requestKey;
  return {
    data: result?.data,
    error: loading ? undefined : result?.error,
    loading,
    reload,
  };
}

export interface ServiceObjectResult<T> {
  readonly data: T | undefined;
  readonly error: unknown;
  readonly loading: boolean;
  readonly reload: () => void;
}

/** Loads one object endpoint (a summary, a record, or a paged list). */
export function useServiceObject<T>(
  path: string,
  query?: Record<string, QueryValue>,
  queryKey = '',
): ServiceObjectResult<T> {
  const api = useApiClient();
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = `${path}|${queryKey}|${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly data?: T;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${path}|${queryKey}|${reloadCount}`;
    api.request<{ data: T }>({ path, query, signal: controller.signal }).then(
      ({ data }) => {
        if (!controller.signal.aborted) setResult({ key, data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, path, query, queryKey, reloadCount]);

  const loading = result?.key !== requestKey;
  return {
    data: result?.data,
    error: loading ? undefined : result?.error,
    loading,
    reload,
  };
}

export interface ServiceMe {
  readonly id: string;
  readonly name: string;
  readonly permissionSets: string[];
  readonly supervisor: boolean;
}

export function useServiceMe(): ServiceMe | undefined {
  const api = useApiClient();
  const [me, setMe] = useState<ServiceMe>();
  useEffect(() => {
    const controller = new AbortController();
    api
      .request<{ data: ServiceMe }>({
        path: 'service/me',
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setMe(data);
        },
        () => undefined,
      );
    return () => controller.abort();
  }, [api]);
  return me;
}

/** Maps an unknown failure to the copy the interface shows for it. */
export function useErrorMessage(): (error: unknown) => string {
  const { t } = useTranslation();
  return (error: unknown) => {
    if (error instanceof ApiClientError) {
      if (error.status === 401) return t('service.error.session');
      if (error.status === 403) return t('service.error.forbidden');
      if (error.status === 404) return t('service.error.notFound');
      if (error.status === 409) return t('service.error.conflict');
      if (error.status === 412) return t('service.error.invalidState');
      if (error.reason === 'SERVICE_ATTACHMENT_CONTENT_INVALID') {
        return t('service.attachments.invalidContent');
      }
      if (error.status === 400) return t('service.error.invalid');
    }
    if (error instanceof Error) {
      if (error.message === 'ATTACHMENT_CONTENT_INVALID') {
        return t('service.attachments.invalidContent');
      }
      if (error.message === 'UPLOAD_FAILED_413') {
        return t('service.attachments.tooLarge');
      }
    }
    return t('service.error.requestFailed');
  };
}

/** Reports an action's outcome; failures use the same copy as loaders. */
export function useActionFeedback(): {
  readonly success: (title: string) => void;
  readonly failure: (error: unknown) => void;
} {
  const toaster = useToaster();
  const message = useErrorMessage();
  return {
    success: (title: string) => toaster.show({ type: 'success', title }),
    failure: (error: unknown) =>
      toaster.show({ type: 'error', title: message(error) }),
  };
}

export function formatDateTime(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function formatDate(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '—';
  return value.slice(0, 10);
}

/** The URL a stored attachment's bytes are served at. */
export function attachmentUrl(file: {
  readonly id: string;
  readonly ext: string;
}): string {
  return resolveAppUrl(`/uploads/tickets/${file.id}.${file.ext}`);
}

/**
 * Reads the first bytes of the chosen file and checks that the content matches
 * the format the two supported kinds claim: a PNG photo and a DOCX report (an
 * Office Open XML ZIP). A corrupt or mislabelled file is refused here, before
 * it is uploaded, so the choice is kept and the failure is explained instead
 * of being stored as a broken attachment. The server repeats the check.
 */
export async function validateAttachmentFile(file: File): Promise<void> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isPng =
    head.length >= 8 &&
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47 &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a;
  const isZip =
    head.length >= 4 &&
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    head[2] === 0x03 &&
    head[3] === 0x04;
  const valid = ext === 'png' ? isPng : ext === 'docx' ? isZip : false;
  // An empty read means the browser has not handed the bytes over yet (or the
  // file is empty). The server validates the stored bytes and answers with the
  // same copy, so an inconclusive client read defers to it instead of refusing
  // a structurally valid report here.
  if (!valid && head.length === 0 && (ext === 'png' || ext === 'docx')) {
    return;
  }
  if (!valid) {
    throw new Error('ATTACHMENT_CONTENT_INVALID');
  }
}

/**
 * Uploads one attachment with real byte progress. The file plugin's upload route
 * reads `multipart/form-data` with a single `file` field, so it is sent here
 * rather than through `api.request`, which reports no progress.
 */
export function uploadAttachment(
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ id: string; filename: string }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', resolveAppUrl('/api/ticketAttachments/uploadOne'));
    request.withCredentials = true;
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          const body = JSON.parse(request.responseText) as {
            data?: { record?: { id?: string; filename?: string } };
          };
          const record = body.data?.record;
          if (record?.id) {
            resolve({ id: record.id, filename: record.filename ?? file.name });
          } else {
            reject(new Error('UPLOAD_MISSING_RECORD'));
          }
        } catch (parseError) {
          reject(
            parseError instanceof Error
              ? parseError
              : new Error(String(parseError)),
          );
        }
        return;
      }
      reject(new Error(`UPLOAD_FAILED_${request.status}`));
    });
    request.addEventListener('error', () =>
      reject(new Error('UPLOAD_NETWORK_ERROR')),
    );
    const form = new FormData();
    form.append('file', file);
    request.send(form);
  });
}

export const TICKET_STATUSES = [
  'pendingAcceptance',
  'pending',
  'processing',
  'pendingConfirmation',
  'closed',
] as const;

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
