import { useRef, useState } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import {
  EyeIcon,
  PaperclipIcon,
  PencilIcon,
  RotateCwIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Label } from './ui/label.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select.js';
import { Spinner } from './ui/spinner.js';
import { FormDialog } from './form-dialog.js';
import { LabFilePreview } from './lab-file-preview.js';
import { FILE_PURPOSE_OPTIONS } from '@/lib/lab-types';
import type { LabFileView } from '@/lib/lab-types';
import { useLabApi } from '@/lib/lab-api';
import { useLabErrorMessage } from '@/lib/lab-errors';
import { formatSize, purposeKey } from '@/lib/lab-file';
import {
  toLabRequestError,
  useAsync,
  type LabRequestError,
} from '@/lib/use-async';
import type { FormFieldSpec } from '@/lib/lab-form';

/** Extensions the server accepts on upload. */
const ACCEPT =
  '.png,.jpg,.jpeg,.gif,.webp,.pdf,.csv,.txt,.md,.docx,.xlsx,.pptx,.zip';

/** Mirrors the server's 20 MB per-request limit, so an oversized pick fails before it is sent. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/** Files one selection may contain. */
const MAX_BATCH_FILES = 20;
/** Total bytes one selection may contain. */
const MAX_BATCH_TOTAL_BYTES = 100 * 1024 * 1024;

type UploadStatus = 'queued' | 'uploading' | 'failed';

interface UploadItem {
  readonly key: string;
  readonly file: File;
  readonly status: UploadStatus;
  readonly error?: LabRequestError;
}

/** Why a whole selection was refused before anything was sent. */
type BatchLimitError =
  | { readonly kind: 'count'; readonly limit: number }
  | {
      readonly kind: 'totalSize';
      readonly limit: number;
      readonly total: number;
    };

export interface LabFileManagerProps {
  readonly targetType: string;
  readonly targetId: number | string;
  /** Whether the viewer may add, edit and remove attachments. */
  readonly canWrite: boolean;
}

/**
 * One queued upload, with its own status and error so a batch names exactly which file failed.
 */
function UploadRow({
  item,
  onRetry,
  onRemove,
}: {
  item: UploadItem;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const message = useLabErrorMessage(item.error);
  const label =
    item.status === 'queued'
      ? t('lab.uploadQueued')
      : item.status === 'uploading'
        ? t('lab.uploading')
        : t('lab.uploadFailed');
  return (
    <li className='flex flex-wrap items-center gap-2 px-2.5 py-2'>
      <span className='min-w-0 flex-1 truncate'>{item.file.name}</span>
      <span className='text-muted-foreground text-xs'>
        {formatSize(item.file.size)}
      </span>
      {item.status === 'uploading' ? (
        <Spinner className='size-4' />
      ) : (
        <Badge variant={item.status === 'failed' ? 'destructive' : 'secondary'}>
          {label}
        </Badge>
      )}
      {item.status === 'failed' ? (
        <Button
          variant='ghost'
          size='icon-sm'
          onClick={onRetry}
          title={t('lab.retry')}
        >
          <RotateCwIcon />
        </Button>
      ) : null}
      {item.status !== 'uploading' ? (
        <Button
          variant='ghost'
          size='icon-sm'
          onClick={onRemove}
          title={t('lab.removeUpload')}
        >
          <XIcon />
        </Button>
      ) : null}
      {item.status === 'failed' && message ? (
        <span className='text-destructive w-full text-xs'>{message}</span>
      ) : null}
    </li>
  );
}

/**
 * The attachments of one record.
 *
 * Each entry is a file stored by this application: the server decides who may read which purpose, so
 * the list is whatever it returned, and the same server decides who may add or remove one. That is
 * why the write controls are hidden for a reader instead of being enforced here.
 */
export function LabFileManager({
  targetType,
  targetId,
  canWrite,
}: LabFileManagerProps) {
  const { t } = useTranslation();
  const api = useLabApi();
  const key = `files:${targetType}:${targetId}`;
  const files = useAsync(key, () => api.files(targetType, targetId));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<LabFileView | null>(null);
  const [removing, setRemoving] = useState<LabFileView | null>(null);
  const [uploads, setUploads] = useState<readonly UploadItem[]>([]);
  const [batchError, setBatchError] = useState<BatchLimitError | null>(null);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [purpose, setPurpose] = useState('');
  const [remark, setRemark] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const loadMessage = useLabErrorMessage(files.error);
  const uploading = uploads.some((item) => item.status !== 'failed');

  const purposeOptions = FILE_PURPOSE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
  }));

  /**
   * Uploads a batch one file at a time.
   *
   * Each file keeps its own status, so one failure names the file that failed, leaves the ones that
   * succeeded in place, and can be retried on its own without resending the whole selection.
   */
  const runUploads = async (batch: readonly UploadItem[]) => {
    let settled = false;
    for (const item of batch) {
      setUploads((current) =>
        current.map((entry) =>
          entry.key === item.key
            ? { ...entry, status: 'uploading', error: undefined }
            : entry,
        ),
      );
      try {
        await api.uploadFile({
          targetType,
          targetId,
          purpose: purpose || undefined,
          remark: remark || undefined,
          file: item.file,
        });
        settled = true;
        setUploads((current) =>
          current.filter((entry) => entry.key !== item.key),
        );
      } catch (thrown) {
        setUploads((current) =>
          current.map((entry) =>
            entry.key === item.key
              ? {
                  ...entry,
                  status: 'failed',
                  error: toLabRequestError(thrown),
                }
              : entry,
          ),
        );
      } finally {
        setProgress((current) =>
          current ? { ...current, done: current.done + 1 } : current,
        );
      }
    }
    if (settled) files.reload();
  };

  /**
   * Queues the files the picker handed over.
   *
   * A selection over either batch limit is refused whole and explained, so the person can split it;
   * a single file over the per-request limit is kept and marked failed, so the rest of the batch is
   * still sent.
   */
  const startUpload = (list: readonly File[]) => {
    if (list.length === 0) return;
    if (inputRef.current) inputRef.current.value = '';
    setBatchError(null);
    const total = list.reduce((sum, file) => sum + file.size, 0);
    if (list.length > MAX_BATCH_FILES) {
      setBatchError({ kind: 'count', limit: MAX_BATCH_FILES });
      return;
    }
    if (total > MAX_BATCH_TOTAL_BYTES) {
      setBatchError({
        kind: 'totalSize',
        limit: MAX_BATCH_TOTAL_BYTES,
        total,
      });
      return;
    }
    const batch: UploadItem[] = list.map((file, index) =>
      file.size > MAX_UPLOAD_BYTES
        ? {
            key: `${Date.now()}-${index}-${file.name}`,
            file,
            status: 'failed',
            error: {
              status: 413,
              code: 'BODY_TOO_LARGE',
              message: 'The file is too large.',
            },
          }
        : {
            key: `${Date.now()}-${index}-${file.name}`,
            file,
            status: 'queued',
          },
    );
    setUploads((current) => [
      ...current.filter((entry) => entry.status === 'failed'),
      ...batch,
    ]);
    const queued = batch.filter((item) => item.status === 'queued');
    if (queued.length > 0) {
      setProgress({ done: 0, total: queued.length });
      void runUploads(queued);
    }
  };

  const retryUpload = (item: UploadItem) => {
    if (uploading) return;
    setProgress({ done: 0, total: 1 });
    void runUploads([item]);
  };

  const detailFields: readonly FormFieldSpec[] = [
    {
      name: 'purpose',
      kind: 'select',
      labelKey: 'lab.filePurposeLabel',
      options: purposeOptions,
    },
    { name: 'remark', kind: 'textarea', labelKey: 'lab.remark', full: true },
  ];

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center justify-between gap-2'>
        <h3 className='flex items-center gap-1.5 text-sm font-medium'>
          <PaperclipIcon className='size-4' />
          {t('lab.attachments')}
          <span className='text-muted-foreground'>
            ({files.data?.length ?? 0})
          </span>
        </h3>
        <Button
          variant='outline'
          size='sm'
          onClick={() => files.reload()}
          disabled={files.loading}
        >
          {t('lab.refresh')}
        </Button>
      </div>

      {canWrite ? (
        <div className='border-border flex flex-col gap-2 rounded-lg border p-3'>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div>
              <Label className='mb-1.5'>{t('lab.file')}</Label>
              <Input
                ref={inputRef}
                type='file'
                accept={ACCEPT}
                multiple
                disabled={uploading}
              />
            </div>
            <div>
              <Label className='mb-1.5'>{t('lab.filePurposeLabel')}</Label>
              <Select
                items={purposeOptions}
                value={purpose || null}
                onValueChange={(next) =>
                  setPurpose(typeof next === 'string' ? next : '')
                }
              >
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder={t('lab.filePurposeUnset')} />
                </SelectTrigger>
                <SelectContent>
                  {purposeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='sm:col-span-2'>
              <Label className='mb-1.5'>{t('lab.remark')}</Label>
              <Input
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
              />
            </div>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              size='sm'
              disabled={uploading}
              onClick={() => {
                startUpload(Array.from(inputRef.current?.files ?? []));
              }}
            >
              {uploading ? <Spinner /> : <UploadIcon />}
              {t('lab.upload')}
            </Button>
            {progress && uploads.length > 0 ? (
              <span className='text-muted-foreground text-xs'>
                {t('lab.uploadProgress', {
                  done: progress.done,
                  total: progress.total,
                })}
              </span>
            ) : (
              <span className='text-muted-foreground text-xs'>
                {t('lab.uploadHint', {
                  count: MAX_BATCH_FILES,
                  size: formatSize(MAX_BATCH_TOTAL_BYTES),
                })}
              </span>
            )}
          </div>
          {batchError ? (
            <Alert variant='destructive'>
              <AlertDescription>
                {batchError.kind === 'count'
                  ? t('lab.batchTooMany', { count: batchError.limit })
                  : t('lab.batchTooLarge', {
                      size: formatSize(batchError.total),
                      limit: formatSize(batchError.limit),
                    })}
              </AlertDescription>
            </Alert>
          ) : null}
          {uploads.length > 0 ? (
            <ul className='divide-border border-border divide-y rounded-md border text-sm'>
              {uploads.map((item) => (
                <UploadRow
                  key={item.key}
                  item={item}
                  onRetry={() => retryUpload(item)}
                  onRemove={() =>
                    setUploads((current) =>
                      current.filter((entry) => entry.key !== item.key),
                    )
                  }
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {files.error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('lab.loadFailed')}</AlertTitle>
          <AlertDescription>{loadMessage}</AlertDescription>
        </Alert>
      ) : null}

      <ul className='divide-border border-border divide-y rounded-lg border'>
        {(files.data ?? []).map((file) => (
          <li key={file.id} className='flex flex-wrap items-center gap-2 p-2.5'>
            <button
              type='button'
              className='min-w-0 flex-1 text-left'
              onClick={() => setSelectedId(file.id)}
            >
              <span className='block truncate text-sm font-medium'>
                {file.filename}
              </span>
              <span className='text-muted-foreground block text-xs'>
                {file.purpose
                  ? t(`lab.filePurpose.${purposeKey(file.purpose)}`)
                  : t('lab.filePurposeUnset')}
                {' · '}
                {formatSize(file.size)}
                {file.remark ? ` · ${file.remark}` : ''}
                {file.uploadedByName
                  ? ` · ${t('lab.uploadedBy', { name: file.uploadedByName })}`
                  : ''}
              </span>
            </button>
            <Badge variant='secondary' className='uppercase'>
              {file.ext || 'file'}
            </Badge>
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => setSelectedId(file.id)}
              title={t('lab.preview')}
            >
              <EyeIcon />
            </Button>
            {canWrite ? (
              <>
                <Button
                  variant='ghost'
                  size='icon-sm'
                  onClick={() => setEditing(file)}
                  title={t('lab.edit')}
                >
                  <PencilIcon />
                </Button>
                <Button
                  variant='ghost'
                  size='icon-sm'
                  onClick={() => setRemoving(file)}
                  title={t('lab.delete')}
                >
                  <TrashIcon />
                </Button>
              </>
            ) : null}
          </li>
        ))}
        {!files.loading && (files.data ?? []).length === 0 ? (
          <li className='text-muted-foreground p-4 text-center text-sm'>
            {t('lab.noAttachments')}
          </li>
        ) : null}
        {files.loading ? (
          <li className='flex items-center justify-center p-4'>
            <Spinner className='size-5' />
          </li>
        ) : null}
      </ul>

      {selectedId ? (
        <LabFilePreview
          files={files.data ?? []}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      {editing ? (
        <FormDialog
          titleKey='lab.editAttachment'
          description={t('lab.uploadedBy', {
            name: editing.uploadedByName ?? t('lab.unset'),
          })}
          fields={detailFields}
          initialValues={editing}
          onSubmit={async (payload) => {
            await api.updateFile(editing.id, payload);
            setEditing(null);
            files.reload();
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {removing ? (
        <FormDialog
          titleKey='lab.deleteAttachment'
          descriptionKey='lab.deleteAttachmentConfirm'
          fields={[]}
          destructive
          submitKey='lab.delete'
          onSubmit={async () => {
            await api.deleteFile(removing.id);
            setRemoving(null);
            files.reload();
          }}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </div>
  );
}
