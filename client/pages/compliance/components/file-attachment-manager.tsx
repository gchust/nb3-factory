import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  DownloadIcon,
  EyeIcon,
  PencilIcon,
  RefreshCwIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  complianceRequest,
  downloadFile,
  errorMessageKey,
  formatBytes,
  formatDateTime,
  normalizeError,
  uploadComplianceFile,
  type ComplianceFile,
} from '../api.js';
import { FILE_CATEGORIES } from '../api.js';
import { fileCategoryKey } from '../labels.js';
import { FilePreviewDialog } from './file-preview-dialog.js';
import { SimpleSelect } from './simple-select.js';

interface UploadTask {
  readonly id: string;
  readonly file: File;
  readonly progress: number;
  readonly status: 'uploading' | 'done' | 'failed';
  readonly error?: string;
}

export interface FileAttachmentManagerProps {
  readonly supplierId?: number;
  readonly contractId?: number;
  readonly organizationId: number;
  readonly canManage: boolean;
  readonly categories?: readonly string[];
}

function localId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function FileAttachmentManager({
  supplierId,
  contractId,
  organizationId,
  canManage,
  categories = FILE_CATEGORIES,
}: FileAttachmentManagerProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const [files, setFiles] = useState<readonly ComplianceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [category, setCategory] = useState(categories[0] ?? 'other');
  const [note, setNote] = useState('');
  const [uploadTasks, setUploadTasks] = useState<readonly UploadTask[]>([]);
  const [previewIndex, setPreviewIndex] = useState(-1);
  const [editing, setEditing] = useState<ComplianceFile>();
  const [editCategory, setEditCategory] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState<ComplianceFile>();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const query: Record<string, number> = {};
      if (supplierId !== undefined) query.supplierId = supplierId;
      if (contractId !== undefined) query.contractId = contractId;
      const data = await complianceRequest<ComplianceFile[]>(api, '/files', {
        query,
      });
      setFiles(data);
    } catch (cause) {
      setError(
        t(errorMessageKey(normalizeError(cause)), {
          defaultValue: 'Unable to load files.',
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [api, contractId, supplierId, t]);

  useEffect(() => {
    // Defer to a microtask so the effect body itself does not synchronously update state.
    queueMicrotask(() => void reload());
  }, [reload]);

  const categoryOptions = categories.map((value) => ({
    value,
    label: t(fileCategoryKey(value), { defaultValue: value }),
  }));

  function patchTask(id: string, patch: Partial<UploadTask>): void {
    setUploadTasks((previous) =>
      previous.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    );
  }

  async function runUpload(task: UploadTask): Promise<void> {
    patchTask(task.id, { status: 'uploading', progress: 0, error: undefined });
    try {
      await uploadComplianceFile(
        task.file,
        {
          supplierId,
          contractId,
          organizationId,
          category,
          note: note.trim() || undefined,
        },
        {
          onProgress: (loaded, total) =>
            patchTask(task.id, { progress: total > 0 ? loaded / total : 0 }),
        },
      );
      patchTask(task.id, { status: 'done', progress: 1 });
      await reload();
    } catch (cause) {
      const normalized = normalizeError(cause);
      patchTask(task.id, {
        status: 'failed',
        error: t(errorMessageKey(normalized), {
          defaultValue: normalized.message,
        }),
      });
    }
  }

  async function handleSelected(list: FileList | null): Promise<void> {
    if (!list || list.length === 0) return;
    const tasks: UploadTask[] = Array.from(list).map((file) => ({
      id: localId(),
      file,
      progress: 0,
      status: 'uploading',
    }));
    setUploadTasks((previous) => [...tasks, ...previous]);
    setNotice(undefined);
    for (const task of tasks) {
      // Sequential uploads keep per-file progress honest and avoid saturating the API.
      await runUpload(task);
    }
    if (inputRef.current) inputRef.current.value = '';
    setNote('');
  }

  function openEdit(file: ComplianceFile): void {
    setEditing(file);
    setEditCategory(file.category);
    setEditNote(file.note ?? '');
  }

  async function saveEdit(): Promise<void> {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const updated = await complianceRequest<ComplianceFile>(
        api,
        `/files/${editing.id}`,
        { method: 'PATCH', json: { category: editCategory, note: editNote } },
      );
      setFiles((previous) =>
        previous.map((file) => (file.id === updated.id ? updated : file)),
      );
      setEditing(undefined);
    } catch (cause) {
      const normalized = normalizeError(cause);
      setNotice(
        t(errorMessageKey(normalized), { defaultValue: normalized.message }),
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleting) return;
    setBusy(true);
    try {
      await complianceRequest(api, `/files/${deleting.id}`, {
        method: 'DELETE',
      });
      setFiles((previous) =>
        previous.filter((file) => file.id !== deleting.id),
      );
      setDeleting(undefined);
    } catch (cause) {
      const normalized = normalizeError(cause);
      setNotice(
        t(errorMessageKey(normalized), { defaultValue: normalized.message }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(file: ComplianceFile): Promise<void> {
    setNotice(undefined);
    try {
      await downloadFile(file);
    } catch (cause) {
      const normalized = normalizeError(cause);
      setNotice(
        t(errorMessageKey(normalized), { defaultValue: normalized.message }),
      );
    }
  }

  return (
    <div className='space-y-4'>
      {canManage ? (
        <div className='flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-end'>
          <div className='w-full sm:w-48'>
            <Label htmlFor='compliance-upload-category'>
              {t('compliance.files.category', { defaultValue: 'Category' })}
            </Label>
            <SimpleSelect
              value={category}
              options={categoryOptions}
              onChange={setCategory}
              className='mt-1'
            />
          </div>
          <div className='flex-1'>
            <Label htmlFor='compliance-upload-note'>
              {t('compliance.files.note', { defaultValue: 'Note (optional)' })}
            </Label>
            <Input
              id='compliance-upload-note'
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className='mt-1'
              placeholder={t('compliance.files.notePlaceholder', {
                defaultValue: 'Applies to this upload batch',
              })}
            />
          </div>
          <div>
            <input
              ref={inputRef}
              type='file'
              multiple
              className='hidden'
              data-testid='compliance-file-input'
              onChange={(event) => void handleSelected(event.target.files)}
            />
            <Button
              type='button'
              onClick={() => inputRef.current?.click()}
              data-testid='compliance-file-upload'
            >
              <UploadIcon />
              {t('compliance.files.upload', { defaultValue: 'Upload files' })}
            </Button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <p className='text-sm text-destructive' role='alert'>
          {notice}
        </p>
      ) : null}

      {uploadTasks.length > 0 ? (
        <ul className='space-y-2' data-testid='compliance-upload-tasks'>
          {uploadTasks.map((task) => (
            <li
              key={task.id}
              className='flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2 text-sm'
            >
              <span className='min-w-0 flex-1 truncate'>{task.file.name}</span>
              <span className='text-xs text-muted-foreground'>
                {formatBytes(task.file.size)}
              </span>
              {task.status === 'uploading' ? (
                <span className='flex items-center gap-2 text-muted-foreground'>
                  <span className='h-1.5 w-28 overflow-hidden rounded bg-muted'>
                    <span
                      className='block h-full bg-primary transition-all'
                      style={{ width: `${Math.round(task.progress * 100)}%` }}
                    />
                  </span>
                  {Math.round(task.progress * 100)}%
                </span>
              ) : null}
              {task.status === 'failed' ? (
                <span className='flex items-center gap-2 text-destructive'>
                  <span className='max-w-64 truncate'>
                    {task.error ?? 'Upload failed.'}
                  </span>
                  <Button
                    variant='outline'
                    size='xs'
                    type='button'
                    onClick={() => void runUpload(task)}
                  >
                    <RefreshCwIcon />
                    {t('compliance.preview.retry', { defaultValue: 'Retry' })}
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon-xs'
                    type='button'
                    aria-label={t('compliance.files.dismiss', {
                      defaultValue: 'Dismiss',
                    })}
                    onClick={() =>
                      setUploadTasks((previous) =>
                        previous.filter((item) => item.id !== task.id),
                      )
                    }
                  >
                    <XIcon />
                  </Button>
                </span>
              ) : null}
              {task.status === 'done' ? (
                <span className='flex items-center gap-2 text-muted-foreground'>
                  {t('compliance.files.uploaded', { defaultValue: 'Uploaded' })}
                  <Button
                    variant='ghost'
                    size='icon-xs'
                    type='button'
                    aria-label={t('compliance.files.dismiss', {
                      defaultValue: 'Dismiss',
                    })}
                    onClick={() =>
                      setUploadTasks((previous) =>
                        previous.filter((item) => item.id !== task.id),
                      )
                    }
                  >
                    <XIcon />
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {loading ? (
        <div
          className='flex items-center gap-2 text-muted-foreground'
          role='status'
        >
          <Spinner />
          {t('status.loading', { defaultValue: 'Loading' })}
        </div>
      ) : null}

      {error ? (
        <p className='text-sm text-destructive' role='alert'>
          {error}
        </p>
      ) : null}

      {!loading && !error && files.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('compliance.files.empty', {
            defaultValue: 'No files uploaded yet.',
          })}
        </p>
      ) : null}

      {files.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {t('compliance.files.name', { defaultValue: 'File' })}
              </TableHead>
              <TableHead>
                {t('compliance.files.category', { defaultValue: 'Category' })}
              </TableHead>
              <TableHead>
                {t('compliance.files.size', { defaultValue: 'Size' })}
              </TableHead>
              <TableHead>
                {t('compliance.files.uploader', {
                  defaultValue: 'Uploaded by',
                })}
              </TableHead>
              <TableHead>
                {t('compliance.files.uploadedAt', {
                  defaultValue: 'Uploaded at',
                })}
              </TableHead>
              <TableHead className='text-right'>
                {t('compliance.files.actions', { defaultValue: 'Actions' })}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((file, fileIndex) => (
              <TableRow key={file.id}>
                <TableCell className='max-w-64'>
                  <button
                    type='button'
                    className='block w-full truncate text-left font-medium hover:underline'
                    onClick={() => setPreviewIndex(fileIndex)}
                    data-testid={`compliance-file-name-${file.id}`}
                  >
                    {file.filename}
                  </button>
                  <span className='text-xs text-muted-foreground'>
                    {file.ext.toUpperCase()}
                  </span>
                  {file.note ? (
                    <span className='block truncate text-xs text-muted-foreground'>
                      {file.note}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  {t(fileCategoryKey(file.category), {
                    defaultValue: file.category,
                  })}
                </TableCell>
                <TableCell>{formatBytes(file.size)}</TableCell>
                <TableCell>{file.uploadedByName ?? '—'}</TableCell>
                <TableCell>{formatDateTime(file.createdAt)}</TableCell>
                <TableCell>
                  <div className='flex justify-end gap-1'>
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      type='button'
                      aria-label={t('compliance.files.preview', {
                        defaultValue: 'Preview',
                      })}
                      onClick={() => setPreviewIndex(fileIndex)}
                    >
                      <EyeIcon />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      type='button'
                      aria-label={t('compliance.files.download', {
                        defaultValue: 'Download',
                      })}
                      onClick={() => void handleDownload(file)}
                    >
                      <DownloadIcon />
                    </Button>
                    {canManage ? (
                      <>
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          type='button'
                          aria-label={t('compliance.files.edit', {
                            defaultValue: 'Edit',
                          })}
                          onClick={() => openEdit(file)}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          type='button'
                          aria-label={t('compliance.files.remove', {
                            defaultValue: 'Remove',
                          })}
                          onClick={() => setDeleting(file)}
                        >
                          <TrashIcon />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <FilePreviewDialog
        files={files}
        index={previewIndex}
        open={previewIndex >= 0 && previewIndex < files.length}
        onOpenChange={(open) => {
          if (!open) setPreviewIndex(-1);
        }}
        onIndexChange={setPreviewIndex}
      />

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('compliance.files.editTitle', {
                defaultValue: 'Edit file details',
              })}
            </DialogTitle>
            <DialogDescription className='truncate'>
              {editing?.filename}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3'>
            <div>
              <Label>
                {t('compliance.files.category', { defaultValue: 'Category' })}
              </Label>
              <SimpleSelect
                value={editCategory}
                options={categoryOptions}
                onChange={setEditCategory}
                className='mt-1'
              />
            </div>
            <div>
              <Label htmlFor='compliance-edit-note'>
                {t('compliance.files.note', { defaultValue: 'Note' })}
              </Label>
              <Input
                id='compliance-edit-note'
                value={editNote}
                onChange={(event) => setEditNote(event.target.value)}
                className='mt-1'
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              type='button'
              onClick={() => setEditing(undefined)}
            >
              {t('actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              type='button'
              disabled={savingEdit}
              onClick={() => void saveEdit()}
            >
              {t('actions.save', { defaultValue: 'Save' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('compliance.files.removeTitle', {
                defaultValue: 'Remove file',
              })}
            </DialogTitle>
            <DialogDescription>
              {t('compliance.files.removeConfirm', {
                defaultValue:
                  'The file and its stored bytes are deleted. Anyone who already downloaded it keeps their copy.',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              type='button'
              onClick={() => setDeleting(undefined)}
            >
              {t('actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              variant='destructive'
              type='button'
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              {t('compliance.files.remove', { defaultValue: 'Remove' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
