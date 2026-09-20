import { useTranslation } from '@nocobase/i18n/client';
import { AlertTriangle, RotateCcw, Upload, X } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  errorKey,
  formatBytes,
  repairApi,
  type Attachment,
} from '@/lib/repair-api';
import { useApiClient } from '@nocobase/app-client';

const MAX_FILES = 5;
const MAX_SIZE = 20 * 1024 * 1024;

interface UploadItem {
  readonly key: string;
  readonly file: File;
  readonly status: 'uploading' | 'error';
  readonly progress: number;
  readonly message?: string;
}

export interface AttachmentUploadProps {
  readonly ticketId: number;
  readonly category: string;
  readonly disabled?: boolean;
  readonly onUploaded: (attachments: Attachment[]) => void;
  readonly labels?: { readonly choose?: string };
}

/**
 * Uploads up to five attachments for one category.
 *
 * Validation happens here as well as on the server: the count and the 20 MB per-file limit are refused before the
 * request is made, and a failed upload keeps its item so it can be retried without re-selecting the files.
 */
export function AttachmentUpload({
  ticketId,
  category,
  disabled = false,
  onUploaded,
  labels,
}: AttachmentUploadProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const controllersRef = useRef(new Map<string, AbortController>());
  const [items, setItems] = useState<UploadItem[]>([]);
  const [error, setError] = useState<string>();

  const describe = (cause: unknown): string => {
    const mapped = errorKey(cause);
    return t(mapped.key, { defaultValue: mapped.fallback });
  };

  const upload = async (item: UploadItem): Promise<void> => {
    const controller = new AbortController();
    controllersRef.current.set(item.key, controller);
    setItems((current) =>
      current.map((candidate) =>
        candidate.key === item.key
          ? {
              ...candidate,
              status: 'uploading',
              progress: 0,
              message: undefined,
            }
          : candidate,
      ),
    );
    try {
      const result = await repairApi.uploadTicketFiles(api, ticketId, {
        files: [item.file],
        category,
        signal: controller.signal,
        onProgress: (loaded, total) => {
          const progress = total ? Math.round((loaded / total) * 100) : 0;
          setItems((current) =>
            current.map((candidate) =>
              candidate.key === item.key
                ? { ...candidate, progress }
                : candidate,
            ),
          );
        },
      });
      controllersRef.current.delete(item.key);
      setItems((current) =>
        current.filter((candidate) => candidate.key !== item.key),
      );
      onUploaded(result.attachments);
    } catch (cause) {
      controllersRef.current.delete(item.key);
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        setItems((current) =>
          current.filter((candidate) => candidate.key !== item.key),
        );
        return;
      }
      const message = describe(cause);
      setError(message);
      setItems((current) =>
        current.map((candidate) =>
          candidate.key === item.key
            ? { ...candidate, status: 'error', message }
            : candidate,
        ),
      );
    }
  };

  const addFiles = (files: readonly File[]): void => {
    setError(undefined);
    if (files.length > MAX_FILES) {
      setError(
        t('repair.files.tooMany', {
          count: MAX_FILES,
          defaultValue: 'At most {{count}} files can be selected at once.',
        }),
      );
      return;
    }
    const accepted: File[] = [];
    for (const file of files) {
      if (file.size > MAX_SIZE) {
        setError(
          t('repair.files.tooLargeNamed', {
            name: file.name,
            defaultValue: '{{name}} is larger than 20 MB.',
          }),
        );
        continue;
      }
      accepted.push(file);
    }
    if (!accepted.length) return;
    const next: UploadItem[] = accepted.map((file) => ({
      key: `${file.name}:${file.size}:${file.lastModified}:${Math.random()}`,
      file,
      status: 'uploading',
      progress: 0,
    }));
    setItems((current) => [...current, ...next]);
    for (const item of next) void upload(item);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    addFiles(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = '';
  };

  const chooseLabel =
    labels?.choose ??
    t('repair.files.choose', { defaultValue: 'Choose files' });

  return (
    <div className='space-y-2'>
      <Button
        type='button'
        variant='outline'
        size='sm'
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Upload aria-hidden='true' />
        {chooseLabel}
      </Button>
      <input
        ref={inputRef}
        className='sr-only'
        type='file'
        multiple
        aria-label={chooseLabel}
        onChange={handleChange}
        disabled={disabled}
      />
      <p className='text-xs text-muted-foreground'>
        {t('repair.files.limits', {
          defaultValue: 'Up to 5 files per upload, 20 MB each.',
        })}
      </p>
      {items.length ? (
        <ul className='space-y-2'>
          {items.map((item) => (
            <li key={item.key} className='rounded-md border p-2 text-sm'>
              <div className='flex items-center justify-between gap-2'>
                <span className='truncate' title={item.file.name}>
                  {item.file.name} · {formatBytes(item.file.size)}
                </span>
                {item.status === 'error' ? (
                  <span className='flex items-center gap-1'>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={() => void upload(item)}
                    >
                      <RotateCcw aria-hidden='true' />
                      {t('repair.files.retry', { defaultValue: 'Retry' })}
                    </Button>
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      aria-label={t('repair.files.cancelUpload', {
                        defaultValue: 'Cancel upload',
                      })}
                      onClick={() =>
                        setItems((current) =>
                          current.filter(
                            (candidate) => candidate.key !== item.key,
                          ),
                        )
                      }
                    >
                      <X aria-hidden='true' />
                    </Button>
                  </span>
                ) : (
                  <Button
                    type='button'
                    size='icon'
                    variant='ghost'
                    aria-label={t('repair.files.cancelUpload', {
                      defaultValue: 'Cancel upload',
                    })}
                    onClick={() =>
                      controllersRef.current.get(item.key)?.abort()
                    }
                  >
                    <X aria-hidden='true' />
                  </Button>
                )}
              </div>
              {item.status === 'uploading' ? (
                <div
                  className='mt-1 h-1.5 w-full overflow-hidden rounded bg-muted'
                  role='progressbar'
                  aria-valuenow={item.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className='h-full bg-primary transition-all'
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              ) : (
                <p className='mt-1 text-destructive'>{item.message}</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p
          className='flex items-center gap-1 text-sm text-destructive'
          role='alert'
        >
          <AlertTriangle aria-hidden='true' className='size-4' />
          {error}
        </p>
      ) : null}
    </div>
  );
}
