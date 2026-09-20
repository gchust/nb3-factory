import { useService } from '@nocobase/app-client';
import {
  clientFileRepositoryManagerToken,
  type FileRecord,
} from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  Download,
  Eye,
  FileAudio,
  FileIcon,
  FileImage,
  FileText,
  FileVideo,
  LoaderCircle,
  RotateCcw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
} from 'react';

import { Button } from '@/components/ui/button';

import type { ExpenseFileView } from '../api.js';
import { Notice } from '../shared.jsx';
import { ExpenseFilePreviewDialog } from './file-preview.js';
import {
  downloadFile,
  formatFileSize,
  isUploadAllowed,
  resolvePreviewKind,
  resolveSafeFileUrl,
  withFeedbackFloor,
} from './file-utils.js';

/**
 * Formats the picker offers. Everything here may be uploaded: formats the
 * in-page preview cannot render (documents, spreadsheets, archives) are still
 * accepted and offered as a download, which is what the requirements ask for.
 * Active or executable content stays blocked instead.
 */
const DEFAULT_ACCEPT: readonly string[] = [
  'image/*',
  'application/pdf',
  'text/*',
  '.txt',
  '.md',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.csv',
  '.zip',
  '.rar',
  '.7z',
];

const DEFAULT_MAX_FILES = 5;
const DEFAULT_MAX_SIZE = 5 * 1024 * 1024;

type UploadStatus = 'uploading' | 'processing' | 'error';

interface UploadTask {
  readonly key: string;
  readonly name: string;
  readonly file?: File;
  readonly status: UploadStatus;
  readonly error?: string;
}

/**
 * Uploads receipts (per expense item) or supporting documents (per report),
 * lists them, and previews/downloads/removes them. The upload itself goes
 * through the File Repository client; attaching the returned id to the report
 * is the caller's business API, so authorization stays with the reimbursement.
 */
export function ExpenseAttachments({
  files,
  canManage,
  attach,
  detach,
  onSaved,
  onError,
  emptyText,
  readOnlyHint,
  accept = DEFAULT_ACCEPT,
  maxFiles = DEFAULT_MAX_FILES,
  maxSize = DEFAULT_MAX_SIZE,
  disabled = false,
}: {
  readonly files: readonly ExpenseFileView[];
  readonly canManage: boolean;
  readonly attach: (fileId: string) => Promise<void>;
  readonly detach: (fileId: string) => Promise<void>;
  readonly onSaved?: () => void;
  readonly onError?: (message: string) => void;
  readonly emptyText?: string;
  /** Shown instead of the reviewer hint when read-only, e.g. for frozen history. */
  readonly readOnlyHint?: string;
  readonly accept?: readonly string[];
  readonly maxFiles?: number;
  readonly maxSize?: number;
  readonly disabled?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository('expenseFiles'),
    [manager],
  );
  const [tasks, setTasks] = useState<readonly UploadTask[]>([]);
  const [notice, setNotice] = useState<string>();
  const [removing, setRemoving] = useState<string>();
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const report = (message: string): void => {
    setNotice(message);
    onError?.(message);
  };

  const updateTask = (key: string, patch: Partial<UploadTask>): void => {
    setTasks((current) =>
      current.map((task) => (task.key === key ? { ...task, ...patch } : task)),
    );
  };

  const uploadOne = async (task: UploadTask, file: File): Promise<void> => {
    let record: FileRecord;
    try {
      const result = await withFeedbackFloor(() =>
        repository.uploadOne({ file }),
      );
      record = result.record;
    } catch {
      updateTask(task.key, {
        error: t('expenses.files.error.upload'),
        status: 'error',
      });
      report(t('expenses.files.error.upload'));
      return;
    }
    updateTask(task.key, { status: 'processing' });
    try {
      await attach(record.id);
      setTasks((current) => current.filter((item) => item.key !== task.key));
      onSaved?.();
    } catch {
      // A file that could not be attached must not be left behind or shown as saved.
      try {
        await detach(record.id);
      } catch {
        // Cleanup is best effort; the unlinked upload stays private to its owner.
      }
      updateTask(task.key, {
        error: t('expenses.files.error.link'),
        status: 'error',
      });
      report(t('expenses.files.error.link'));
    }
  };

  const handleFiles = (selected: readonly File[]): void => {
    if (disabled || selected.length === 0) return;
    setNotice(undefined);
    if (selected.length > maxFiles) {
      report(t('expenses.files.error.tooMany', { count: maxFiles }));
      return;
    }
    const accepted: File[] = [];
    for (const file of selected) {
      if (file.size === 0) {
        report(t('expenses.files.error.empty'));
        continue;
      }
      if (file.size > maxSize) {
        report(
          t('expenses.files.error.tooLarge', {
            size: formatFileSize(maxSize),
          }),
        );
        continue;
      }
      if (!isUploadAllowed(file, accept)) {
        report(t('expenses.files.error.type'));
        continue;
      }
      accepted.push(file);
    }
    const queued = accepted.map((file): UploadTask => ({
      key: `${file.name}:${file.size}:${file.lastModified}:${Math.random()}`,
      name: file.name,
      file,
      status: 'uploading',
    }));
    if (queued.length === 0) return;
    setTasks((current) => [...current, ...queued]);
    void (async () => {
      for (const task of queued) {
        if (task.file) await uploadOne(task, task.file);
      }
    })();
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    handleFiles(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = '';
  };

  const remove = async (file: ExpenseFileView): Promise<void> => {
    setNotice(undefined);
    setRemoving(file.id);
    try {
      await detach(file.id);
    } catch {
      report(t('expenses.files.error.remove'));
    } finally {
      setRemoving(undefined);
    }
  };

  const retry = (task: UploadTask): void => {
    if (!task.file) return;
    setNotice(undefined);
    updateTask(task.key, { status: 'uploading', error: undefined });
    void uploadOne(task, task.file);
  };

  return (
    <div className='space-y-3' data-slot='expense-attachments'>
      {notice ? (
        <Notice tone='error'>
          <div className='flex items-start justify-between gap-3'>
            <span>{notice}</span>
            <button
              aria-label={t('expenses.files.dismiss')}
              className='text-xs underline'
              onClick={() => setNotice(undefined)}
              type='button'
            >
              {t('expenses.files.dismiss')}
            </button>
          </div>
        </Notice>
      ) : null}

      <UploadProgress tasks={tasks} />

      {files.length === 0 && tasks.length === 0 ? (
        <p className='text-sm text-muted-foreground' role='status'>
          {emptyText ?? t('expenses.files.empty')}
        </p>
      ) : (
        <ul className='grid gap-2 sm:grid-cols-2'>
          {files.map((file, index) => (
            <li
              className='flex min-w-0 items-center gap-3 rounded-md border border-border p-2'
              key={file.id}
            >
              <span className='flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/40 text-muted-foreground'>
                <FileThumbnail file={file} />
              </span>
              <span className='min-w-0 flex-1'>
                <span
                  className='block truncate text-sm font-medium'
                  title={file.filename}
                >
                  {file.filename}
                </span>
                <span className='block text-xs text-muted-foreground'>
                  {formatFileSize(file.size)}
                </span>
              </span>
              <span className='flex shrink-0 items-center gap-1'>
                <Button
                  aria-label={`${t('expenses.files.preview')}: ${file.filename}`}
                  onClick={() => {
                    setPreviewIndex(index);
                    setPreviewOpen(true);
                  }}
                  size='icon'
                  title={t('expenses.files.preview')}
                  type='button'
                  variant='ghost'
                >
                  <Eye aria-hidden='true' />
                </Button>
                <Button
                  aria-label={`${t('expenses.files.download')}: ${file.filename}`}
                  onClick={() => {
                    const url = resolveSafeFileUrl(file.contentUrl);
                    if (url) downloadFile(url, file.filename);
                  }}
                  size='icon'
                  title={t('expenses.files.download')}
                  type='button'
                  variant='ghost'
                >
                  <Download aria-hidden='true' />
                </Button>
                {canManage ? (
                  <Button
                    aria-label={`${t('expenses.files.remove')}: ${file.filename}`}
                    disabled={removing === file.id}
                    onClick={() => void remove(file)}
                    size='icon'
                    title={t('expenses.files.remove')}
                    type='button'
                    variant='ghost'
                  >
                    {removing === file.id ? (
                      <LoaderCircle
                        aria-hidden='true'
                        className='animate-spin'
                      />
                    ) : (
                      <Trash2 aria-hidden='true' />
                    )}
                  </Button>
                ) : null}
              </span>
            </li>
          ))}

          {tasks.map((task) => (
            <li
              className='flex min-w-0 items-center gap-3 rounded-md border border-dashed border-border p-2'
              key={task.key}
            >
              <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted/40 text-muted-foreground'>
                {task.status === 'error' ? (
                  <X aria-hidden='true' />
                ) : (
                  <LoaderCircle aria-hidden='true' className='animate-spin' />
                )}
              </span>
              <span className='min-w-0 flex-1'>
                <span
                  className='block truncate text-sm font-medium'
                  title={task.name}
                >
                  {task.name}
                </span>
                <span className='block text-xs text-muted-foreground'>
                  {task.status === 'uploading'
                    ? t('expenses.files.uploading')
                    : task.status === 'processing'
                      ? t('expenses.files.processing')
                      : (task.error ?? t('expenses.files.error.upload'))}
                </span>
              </span>
              {task.status === 'error' ? (
                <>
                  <Button
                    aria-label={`${t('expenses.files.retry')}: ${task.name}`}
                    onClick={() => retry(task)}
                    size='icon'
                    title={t('expenses.files.retry')}
                    type='button'
                    variant='ghost'
                  >
                    <RotateCcw aria-hidden='true' />
                  </Button>
                  <Button
                    aria-label={`${t('expenses.files.dismiss')}: ${task.name}`}
                    onClick={() =>
                      setTasks((current) =>
                        current.filter((item) => item.key !== task.key),
                      )
                    }
                    size='icon'
                    title={t('expenses.files.dismiss')}
                    type='button'
                    variant='ghost'
                  >
                    <X aria-hidden='true' />
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div>
          <Button
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            type='button'
            variant='outline'
          >
            <UploadCloud aria-hidden='true' />
            {t('expenses.files.add')}
          </Button>
          <p className='mt-1 text-xs text-muted-foreground'>
            {t('expenses.files.acceptHint', {
              size: formatFileSize(maxSize),
              count: maxFiles,
            })}
          </p>
          <input
            accept={accept.join(',')}
            aria-label={t('expenses.files.add')}
            className='sr-only'
            multiple
            onChange={handleChange}
            ref={inputRef}
            type='file'
          />
        </div>
      ) : (
        <p className='text-xs text-muted-foreground'>
          {readOnlyHint ?? t('expenses.files.reviewerHint')}
        </p>
      )}

      <ExpenseFilePreviewDialog
        files={files}
        initialIndex={previewIndex}
        onOpenChange={setPreviewOpen}
        open={previewOpen}
      />
    </div>
  );
}

/**
 * One live region that announces the whole batch while files are uploading, so
 * the state is visible in every snapshot even when the picker closes
 * immediately and several files are queued. The rows below carry per-file
 * status.
 */
function UploadProgress({
  tasks,
}: {
  readonly tasks: readonly UploadTask[];
}): ReactElement | null {
  const { t } = useTranslation();
  const active = tasks.filter((task) => task.status !== 'error').length;
  if (active === 0) return null;
  return (
    <p
      aria-live='polite'
      className='flex items-center gap-2 text-sm text-muted-foreground'
      role='status'
    >
      <LoaderCircle aria-hidden='true' className='size-4 animate-spin' />
      {t('expenses.files.uploadingCount', { count: active })}
    </p>
  );
}

function FileThumbnail({
  file,
}: {
  readonly file: ExpenseFileView;
}): ReactElement {
  const kind = resolvePreviewKind(file);
  const url = resolveSafeFileUrl(file.contentUrl);
  if (kind === 'image' && url) {
    // The content route is same-origin and session-protected, so the browser
    // sends the session cookie with this request.
    return (
      <img
        alt={file.filename}
        className='h-full w-full object-cover'
        src={url}
      />
    );
  }
  if (kind === 'image') return <FileImage aria-hidden='true' />;
  if (kind === 'pdf') return <FileText aria-hidden='true' />;
  if (kind === 'audio') return <FileAudio aria-hidden='true' />;
  if (kind === 'video') return <FileVideo aria-hidden='true' />;
  return <FileIcon aria-hidden='true' />;
}
