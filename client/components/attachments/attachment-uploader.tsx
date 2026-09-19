import { useTranslation } from '@nocobase/i18n/client';
import { LoaderCircle } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import {
  FileUploadField,
  type ClientFileRepository,
  type FileRecord,
  type FileUiLabels,
} from '@/extensions/nocobase-file-component-ui';
import { requestErrorMessage } from '@/lib/use-api-data';

const NO_FILES: readonly FileRecord[] = [];

export interface AttachmentUploaderProps {
  readonly repository: ClientFileRepository;
  readonly onFiles: (fileIds: readonly string[]) => Promise<void>;
  readonly multiple?: boolean;
  readonly accept?: readonly string[];
  readonly maxFiles?: number;
  readonly maxSize?: number;
  readonly disabled?: boolean;
  readonly onError?: (error: Error) => void;
}

/**
 * Uploads through the File Repository, then hands the new file ids to the
 * caller to link. The displayed files are never optimistic: a file appears in
 * the list only after the link request succeeds, so a failed link cannot look
 * like a saved attachment.
 */
export function AttachmentUploader({
  repository,
  onFiles,
  multiple = false,
  accept,
  maxFiles,
  maxSize,
  disabled = false,
  onError,
}: AttachmentUploaderProps): ReactElement {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const emptyMessage = t('rentals.errors.EMPTY_FILE');
  // The File component UI checks size and type, but uploads a zero-byte file.
  // Rejecting it here keeps an empty file from ever becoming a stored record.
  const guarded = useMemo(
    () =>
      new Proxy(repository, {
        get(target, property, receiver) {
          if (property === 'uploadOne') {
            return async (input: { file: File }, options?: unknown) => {
              if (!input.file.size) throw new Error(emptyMessage);
              return target.uploadOne(input, options as never);
            };
          }
          if (property === 'uploadMany') {
            return async (
              input: { files: readonly File[] },
              options?: unknown,
            ) => {
              if (input.files.some((file) => !file.size)) {
                throw new Error(emptyMessage);
              }
              return target.uploadMany(input, options as never);
            };
          }
          const value: unknown = Reflect.get(target, property, receiver);
          return typeof value === 'function'
            ? (value as (...args: unknown[]) => unknown).bind(target)
            : value;
        },
      }),
    [repository, emptyMessage],
  );

  const labels: FileUiLabels = {
    choose: t('rentals.attachments.choose'),
    empty: t('rentals.attachments.empty'),
    preview: t('rentals.attachments.preview'),
    download: t('rentals.attachments.download'),
    remove: t('rentals.attachments.remove'),
    retry: t('rentals.attachments.retry'),
  };

  const handleChange = (next: readonly FileRecord[]): void => {
    if (!next.length) return;
    setBusy(true);
    setError(null);
    void onFiles(next.map((record) => record.id))
      .catch((cause: unknown) => {
        setError(cause);
        onError?.(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className='space-y-2'>
      <FileUploadField
        accept={accept}
        disabled={disabled}
        labels={labels}
        maxFiles={maxFiles}
        maxSize={maxSize}
        multiple={multiple}
        onChange={handleChange}
        onError={(cause) => setError(cause)}
        repository={guarded}
        value={NO_FILES}
      />
      {busy ? (
        <p
          className='flex items-center gap-2 text-xs text-muted-foreground'
          role='status'
        >
          <LoaderCircle className='size-3 animate-spin' />
          {t('rentals.attachments.processing')}
        </p>
      ) : null}
      {error ? (
        <p className='text-xs text-destructive' role='alert'>
          {requestErrorMessage(error, t('rentals.attachments.uploadFailed'))}
        </p>
      ) : null}
    </div>
  );
}
