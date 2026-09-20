import { useTranslation } from '@nocobase/i18n/client';
import { Eye, Star, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';
import type { ApiClient } from '@nocobase/app-client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

import {
  deleteMaterialFile,
  errorCode,
  setMaterialCover,
  uploadMaterialFiles,
  type MaterialDetailDto,
  type MaterialFileDto,
} from './api.js';
import {
  Alert,
  ConfirmDialog,
  DownloadLink,
  PreviewIcon,
} from './components.js';
import { formatBytes, formatDateTime } from './format.js';

const MAX_FILES_PER_UPLOAD = 3;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export interface MaterialFilesProps {
  readonly api: ApiClient;
  readonly material: MaterialDetailDto;
  readonly onRefresh: () => Promise<void>;
  readonly onPreview: (file: MaterialFileDto) => void;
}

export function MaterialFiles({
  api,
  material,
  onRefresh,
  onPreview,
}: MaterialFilesProps): ReactElement {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState<'attachment' | 'cover'>('attachment');
  const [selection, setSelection] = useState<readonly File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<MaterialFileDto | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const canManage = material.canManage;

  const onSelect = (files: FileList | null): void => {
    const chosen = files ? Array.from(files) : [];
    setNotice(null);
    if (chosen.length > MAX_FILES_PER_UPLOAD) {
      setError(
        t('library.tooManyFiles', {
          max: MAX_FILES_PER_UPLOAD,
          count: chosen.length,
        }),
      );
      setSelection([]);
      return;
    }
    const oversized = chosen.find((file) => file.size > MAX_FILE_SIZE_BYTES);
    if (oversized) {
      setError(
        t('library.fileTooLarge', { name: oversized.name, max: '5 MB' }),
      );
      setSelection([]);
      return;
    }
    setError(null);
    setSelection(chosen);
  };

  const upload = async (): Promise<void> => {
    if (selection.length === 0) {
      setError(t('library.noFileSelected'));
      return;
    }
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      await uploadMaterialFiles(api, material.id, selection, role);
      setSelection([]);
      if (inputRef.current) inputRef.current.value = '';
      setNotice(t('library.uploadSuccess', { count: selection.length }));
      await onRefresh();
    } catch (cause) {
      const code = errorCode(cause);
      if (code === 'FILE_TOO_LARGE') setError(t('library.fileTooLargeServer'));
      else if (code === 'TOO_MANY_FILES')
        setError(t('library.tooManyFilesServer'));
      else if (code === 'FORBIDDEN') setError(t('library.error.forbidden'));
      else setError(t('library.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const removeFile = async (): Promise<void> => {
    if (!pendingRemove) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMaterialFile(api, material.id, pendingRemove.id);
      setPendingRemove(null);
      await onRefresh();
    } catch (cause) {
      setError(
        errorCode(cause) === 'FORBIDDEN'
          ? t('library.error.forbidden')
          : t('library.removeFailed'),
      );
      setPendingRemove(null);
    } finally {
      setBusy(false);
    }
  };

  const makeCover = async (file: MaterialFileDto): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await setMaterialCover(api, material.id, file.id);
      await onRefresh();
    } catch (cause) {
      setError(
        errorCode(cause) === 'FORBIDDEN'
          ? t('library.error.forbidden')
          : t('library.coverFailed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className='space-y-3'>
      <div className='flex items-center justify-between'>
        <h2 className='font-heading text-lg font-medium'>
          {t('library.files')}
        </h2>
        <span className='text-sm text-muted-foreground'>
          {t('library.fileCount', { count: material.files.length })}
        </span>
      </div>

      {canManage ? (
        <div className='space-y-2 rounded-lg border border-dashed border-border p-3'>
          <div className='flex flex-wrap items-end gap-3'>
            <div className='grid gap-1.5'>
              <Label htmlFor='library-upload-role'>
                {t('library.uploadRole')}
              </Label>
              <select
                className='h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
                id='library-upload-role'
                onChange={(event) =>
                  setRole(
                    event.target.value === 'cover' ? 'cover' : 'attachment',
                  )
                }
                value={role}
              >
                <option value='attachment'>
                  {t('library.roleAttachment')}
                </option>
                <option value='cover'>{t('library.roleCover')}</option>
              </select>
            </div>
            <input
              className='text-sm file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-2 file:py-1'
              multiple
              onChange={(event) => onSelect(event.target.files)}
              ref={inputRef}
              type='file'
            />
            <Button
              disabled={uploading}
              onClick={() => void upload()}
              size='sm'
            >
              {uploading ? <Spinner /> : <Upload />}
              {t('library.upload')}
            </Button>
          </div>
          <p className='text-xs text-muted-foreground'>
            {t('library.uploadHint', { max: MAX_FILES_PER_UPLOAD })}
          </p>
          {selection.length > 0 ? (
            <p className='text-xs text-muted-foreground'>
              {selection
                .map((file) => `${file.name} (${formatBytes(file.size)})`)
                .join('、')}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <Alert tone='error'>{error}</Alert> : null}
      {notice ? <Alert tone='info'>{notice}</Alert> : null}

      {material.files.length === 0 ? (
        <p className='rounded-lg border border-border p-4 text-sm text-muted-foreground'>
          {t('library.filesEmpty')}
        </p>
      ) : (
        <ul className='divide-y divide-border rounded-lg border border-border'>
          {material.files.map((file) => (
            <li
              className='flex flex-wrap items-center gap-3 px-3 py-2.5'
              key={file.id}
            >
              <PreviewIcon file={file} />
              <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-2'>
                  <span className='truncate text-sm font-medium'>
                    {file.filename}
                  </span>
                  {file.role === 'cover' ? (
                    <span className='rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary'>
                      {t('library.cover')}
                    </span>
                  ) : null}
                </div>
                <p className='text-xs text-muted-foreground'>
                  {formatBytes(file.size)} ·{' '}
                  {file.uploaderName ?? t('library.unknownUploader')} ·{' '}
                  {formatDateTime(file.createdAt)}
                </p>
              </div>
              <div className='flex items-center gap-1'>
                <Button
                  onClick={() => onPreview(file)}
                  size='sm'
                  variant='ghost'
                >
                  <Eye />
                  {t('library.preview')}
                </Button>
                <DownloadLink fileId={file.id} label={t('library.download')} />
                {canManage && file.role !== 'cover' ? (
                  <Button
                    disabled={busy}
                    onClick={() => void makeCover(file)}
                    size='sm'
                    variant='ghost'
                  >
                    <Star />
                    {t('library.setCover')}
                  </Button>
                ) : null}
                {canManage ? (
                  <Button
                    className={cn('text-destructive')}
                    disabled={busy}
                    onClick={() => setPendingRemove(file)}
                    size='sm'
                    variant='ghost'
                  >
                    <Trash2 />
                    {t('library.removeFile')}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        busy={busy}
        confirmLabel={t('library.removeFile')}
        description={pendingRemove?.filename ?? ''}
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => void removeFile()}
        open={pendingRemove !== null}
        title={t('library.removeFileConfirm')}
      />
    </section>
  );
}
