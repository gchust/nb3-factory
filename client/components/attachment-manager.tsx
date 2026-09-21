import { useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Download, Eye, Pencil, Trash2, UploadCloud } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FileUploadField,
  clientFileRepositoryManagerToken,
  type FileRecord,
  type FileUploadStatus,
} from '@/extensions/nocobase-file-component-ui';
import type { DeliveryFile } from '@/lib/delivery-api';
import { formatBytes, formatDateTime } from '@/lib/format';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILES_PER_BATCH = 5;

export interface AttachmentManagerProps {
  /** File Repository resource name, for example `deliveryProjectFiles`. */
  readonly resource: string;
  readonly files: readonly DeliveryFile[];
  readonly canManage: boolean;
  readonly onAdd: (fileIds: readonly string[]) => Promise<void>;
  readonly onRename: (fileId: string, filename: string) => Promise<void>;
  readonly onRemove: (fileId: string) => Promise<void>;
  readonly onPreview: (files: readonly DeliveryFile[], index: number) => void;
  readonly emptyHint?: string;
}

/**
 * Upload, list, rename and remove attachments of one business record.
 *
 * Uploads go through the registered File Repository (so bytes, metadata and the
 * uploader stamp are produced by the plugin) and are then attached to the record
 * through the application's own API, which enforces the record's permissions.
 */
export function AttachmentManager({
  resource,
  files,
  canManage,
  onAdd,
  onRename,
  onRemove,
  onPreview,
  emptyHint,
}: AttachmentManagerProps): ReactElement {
  const { t } = useTranslation();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository(resource),
    [manager, resource],
  );
  const [selected, setSelected] = useState<readonly FileRecord[]>([]);
  const [status, setStatus] = useState<FileUploadStatus>('idle');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string>();
  const [renameValue, setRenameValue] = useState('');

  const save = async (): Promise<void> => {
    if (!selected.length) return;
    setBusy(true);
    setError(undefined);
    try {
      await onAdd(selected.map((file) => file.id));
      setSelected([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const commitRename = async (fileId: string): Promise<void> => {
    const next = renameValue.trim();
    setRenamingId(undefined);
    if (!next) return;
    setError(undefined);
    try {
      await onRename(fileId, next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className='space-y-3'>
      {canManage ? (
        <div className='space-y-2 rounded-md border border-border p-3'>
          <FileUploadField
            repository={repository}
            value={selected}
            onChange={setSelected}
            onStatusChange={setStatus}
            onError={(cause) => setError(cause.message)}
            multiple
            maxSize={MAX_FILE_BYTES}
            maxFiles={MAX_FILES_PER_BATCH}
            labels={{
              choose: t('delivery.files.choose'),
              empty: t('delivery.files.noSelection'),
              remove: t('delivery.files.removeSelection'),
              retry: t('delivery.files.retry'),
            }}
          />
          <p className='text-xs text-muted-foreground'>
            {t('delivery.files.uploadHint', {
              size: 20,
              count: MAX_FILES_PER_BATCH,
            })}
          </p>
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              disabled={!selected.length || busy || status === 'error'}
              onClick={() => void save()}
            >
              <UploadCloud aria-hidden='true' />{' '}
              {t('delivery.files.attachSelected')}
            </Button>
            {selected.length ? (
              <Button
                type='button'
                variant='ghost'
                onClick={() => setSelected([])}
              >
                {t('actions.cancel')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          className='rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive'
          role='alert'
        >
          {error}
        </p>
      ) : null}

      {files.length ? (
        <ul className='divide-y divide-border rounded-md border border-border'>
          {files.map((file, index) => (
            <li key={file.id} className='flex flex-wrap items-center gap-2 p-3'>
              <div className='min-w-0 flex-1'>
                {renamingId === file.id ? (
                  <div className='flex items-center gap-2'>
                    <Input
                      aria-label={t('delivery.files.rename')}
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                    />
                    <Button
                      type='button'
                      size='sm'
                      onClick={() => void commitRename(file.id)}
                    >
                      {t('actions.save')}
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={() => setRenamingId(undefined)}
                    >
                      {t('actions.cancel')}
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className='truncate font-medium'>{file.filename}</p>
                    <p className='text-xs text-muted-foreground'>
                      {file.mimeType} · {formatBytes(file.size)} ·{' '}
                      {file.uploadedByName || '—'} ·{' '}
                      {formatDateTime(file.createdAt)}
                    </p>
                  </>
                )}
              </div>
              <div className='flex items-center gap-1'>
                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  onClick={() => onPreview(files, index)}
                >
                  <Eye aria-hidden='true' /> {t('delivery.files.preview')}
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = file.contentUrl;
                    link.download = file.filename;
                    link.rel = 'noopener';
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                  }}
                >
                  <Download aria-hidden='true' /> {t('delivery.files.download')}
                </Button>
                {canManage ? (
                  <>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={() => {
                        setRenamingId(file.id);
                        setRenameValue(file.filename);
                      }}
                    >
                      <Pencil aria-hidden='true' /> {t('delivery.files.rename')}
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={() => {
                        setError(undefined);
                        void onRemove(file.id).catch((cause: unknown) =>
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : String(cause),
                          ),
                        );
                      }}
                    >
                      <Trash2 aria-hidden='true' /> {t('delivery.files.remove')}
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className='rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground'>
          {emptyHint ?? t('delivery.files.empty')}
        </p>
      )}
    </div>
  );
}
