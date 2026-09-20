import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import {
  Download,
  Eye,
  FileText,
  Pencil,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  errorKey,
  formatBytes,
  formatDateTime,
  repairApi,
  type Attachment,
} from '@/lib/repair-api';

import { FilePreviewDialog } from './file-preview-dialog';

export interface AttachmentListProps {
  readonly attachments: readonly Attachment[];
  readonly canEdit: boolean;
  readonly onChanged: () => void | Promise<void>;
  /**
   * The set the preview dialog steps through. Defaults to this list; the ticket detail passes every attachment of
   * the ticket so previous/next moves between all of them, not only within one category.
   */
  readonly previewFiles?: readonly Attachment[];
}

/**
 * The attachment list for one category.
 *
 * Shows the original filename, type, size, uploader and time; preview, download, rename/note and removal all act on
 * the business record, and every action re-reads the record so the page never shows a stale list.
 */
export function AttachmentList({
  attachments,
  canEdit,
  onChanged,
  previewFiles,
}: AttachmentListProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [previewIndex, setPreviewIndex] = useState<number>();
  const previewList = previewFiles ?? attachments;
  const [editing, setEditing] = useState<string>();
  const [draftName, setDraftName] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [confirming, setConfirming] = useState<string>();
  const [error, setError] = useState<string>();

  if (!attachments.length) {
    return (
      <p className='text-sm text-muted-foreground' role='status'>
        {t('repair.files.empty', { defaultValue: 'No files yet.' })}
      </p>
    );
  }

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(undefined);
    try {
      await action();
      await onChanged();
    } catch (cause) {
      const mapped = errorKey(cause);
      setError(t(mapped.key, { defaultValue: mapped.fallback }));
    }
  };

  return (
    <div className='space-y-2'>
      <ul className='space-y-2'>
        {attachments.map((attachment) => (
          <li
            key={attachment.fileId}
            className='rounded-md border p-3 text-sm'
            data-testid='attachment-item'
          >
            {editing === attachment.fileId ? (
              <div className='space-y-2'>
                <Input
                  aria-label={t('repair.files.filename', {
                    defaultValue: 'File name',
                  })}
                  value={draftName}
                  onChange={(event) => setDraftName(event.currentTarget.value)}
                />
                <Textarea
                  aria-label={t('repair.files.note', { defaultValue: 'Note' })}
                  value={draftNote}
                  onChange={(event) => setDraftNote(event.currentTarget.value)}
                />
                <div className='flex gap-2'>
                  <Button
                    type='button'
                    size='sm'
                    onClick={() =>
                      void run(async () => {
                        await repairApi.updateFile(api, attachment.fileId, {
                          filename: draftName,
                          note: draftNote,
                        });
                        setEditing(undefined);
                      })
                    }
                  >
                    {t('actions.save', { defaultValue: 'Save' })}
                  </Button>
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    onClick={() => setEditing(undefined)}
                  >
                    {t('actions.cancel', { defaultValue: 'Cancel' })}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className='flex flex-wrap items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <div className='flex items-center gap-2'>
                      <FileText
                        aria-hidden='true'
                        className='size-4 shrink-0'
                      />
                      <span
                        className='truncate font-medium'
                        title={attachment.filename}
                      >
                        {attachment.filename}
                      </span>
                    </div>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {attachment.mimeType} · {formatBytes(attachment.size)}
                      {attachment.uploadedByName
                        ? ` · ${attachment.uploadedByName}`
                        : ''}
                      {attachment.createdAt
                        ? ` · ${formatDateTime(attachment.createdAt)}`
                        : ''}
                    </p>
                    {attachment.note ? (
                      <p className='mt-1 text-xs text-muted-foreground'>
                        {attachment.note}
                      </p>
                    ) : null}
                  </div>
                  <div className='flex shrink-0 items-center gap-1'>
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      aria-label={`${t('repair.files.preview', {
                        defaultValue: 'Preview',
                      })}: ${attachment.filename}`}
                      onClick={() =>
                        setPreviewIndex(
                          previewList.findIndex(
                            (candidate) =>
                              candidate.fileId === attachment.fileId,
                          ),
                        )
                      }
                    >
                      <Eye aria-hidden='true' />
                    </Button>
                    <a
                      className='inline-flex size-9 items-center justify-center rounded-md hover:bg-accent'
                      aria-label={`${t('repair.files.download', {
                        defaultValue: 'Download',
                      })}: ${attachment.filename}`}
                      href={`${attachment.contentUrl ?? ''}${(attachment.contentUrl ?? '').includes('?') ? '&' : '?'}download=1`}
                      rel='noopener'
                      download={attachment.filename}
                    >
                      <Download aria-hidden='true' className='size-4' />
                    </a>
                    {canEdit ? (
                      <>
                        <Button
                          type='button'
                          size='icon'
                          variant='ghost'
                          aria-label={`${t('repair.files.edit', {
                            defaultValue: 'Rename or add a note',
                          })}: ${attachment.filename}`}
                          onClick={() => {
                            setEditing(attachment.fileId);
                            setDraftName(attachment.filename);
                            setDraftNote(attachment.note ?? '');
                          }}
                        >
                          <Pencil aria-hidden='true' />
                        </Button>
                        <Button
                          type='button'
                          size='icon'
                          variant='ghost'
                          aria-label={`${t('repair.files.remove', {
                            defaultValue: 'Remove',
                          })}: ${attachment.filename}`}
                          onClick={() => setConfirming(attachment.fileId)}
                        >
                          <Trash2 aria-hidden='true' />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
                {confirming === attachment.fileId ? (
                  <div className='mt-2 flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2'>
                    <span>
                      {t('repair.files.confirmRemove', {
                        defaultValue: 'Remove this file from the ticket?',
                      })}
                    </span>
                    <Button
                      type='button'
                      size='sm'
                      variant='destructive'
                      onClick={() =>
                        void run(async () => {
                          await repairApi.deleteFile(api, attachment.fileId);
                          setConfirming(undefined);
                        })
                      }
                    >
                      {t('repair.files.confirmRemoveYes', {
                        defaultValue: 'Remove',
                      })}
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={() => setConfirming(undefined)}
                    >
                      {t('actions.cancel', { defaultValue: 'Cancel' })}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
      {error ? (
        <p
          className='flex items-center gap-1 text-sm text-destructive'
          role='alert'
        >
          <RotateCcw aria-hidden='true' className='size-4' />
          {error}
        </p>
      ) : null}
      {previewIndex !== undefined ? (
        <FilePreviewDialog
          files={previewList}
          initialIndex={Math.max(0, previewIndex)}
          open
          onOpenChange={(open) => {
            if (!open) setPreviewIndex(undefined);
          }}
        />
      ) : null}
    </div>
  );
}
