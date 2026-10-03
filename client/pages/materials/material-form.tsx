import { useTranslation } from '@nocobase/i18n/client';
import { LoaderCircle } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactElement } from 'react';

import type { FileRecord } from '@nocobase/app-plugin-file/client';
import {
  FilePreviewContent,
  FileUploadField,
  clientFileRepositoryManagerToken,
  type FileUploadStatus,
} from '@/extensions/nocobase-file-component-ui/index';
import { resolveFilePreviewKind } from '@/extensions/nocobase-file-component-ui/lib/file-preview';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useService } from '@nocobase/app-client';

import {
  MATERIAL_FILE_COLLECTION,
  type Material,
  type MaterialAttachment,
} from './api';

/** The subset of `FileRecord` the form keeps while a material is not saved yet. */
export interface MaterialDraft {
  readonly title: string;
  readonly files: readonly FileRecord[];
}

export interface MaterialFormProps {
  readonly draft: MaterialDraft;
  readonly onDraftChange: (draft: MaterialDraft) => void;
  readonly onSave: () => void | Promise<void>;
  readonly saving: boolean;
  /** The server's rejection, shown until the next save attempt. */
  readonly error?: string;
  readonly titleError?: string;
  readonly saveLabel?: string;
  /** Existing attachments of a saved material; each can be removed and saved. */
  readonly savedAttachments?: readonly MaterialAttachment[];
  readonly onRemoveSavedAttachment?: (id: string) => void;
}

/**
 * The title and attachment fields shared by the create and detail pages.
 *
 * An upload happens as soon as a file is chosen, so the uploaded record is kept
 * in the draft: a rejected save leaves it in place and the next save reuses it
 * instead of uploading again.
 */
export function MaterialForm(inputProps: MaterialFormProps): ReactElement {
  const { t } = useTranslation();
  const {
    draft,
    onDraftChange,
    onSave,
    saving,
    error,
    titleError,
    saveLabel,
    savedAttachments = [],
    onRemoveSavedAttachment,
  } = inputProps;

  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository(MATERIAL_FILE_COLLECTION),
    [manager],
  );
  const [status, setStatus] = useState<FileUploadStatus>('idle');
  const [uploadError, setUploadError] = useState<string>();

  const handleError = useCallback(
    (cause: Error) => setUploadError(cause.message),
    [],
  );

  const statusLabel: Record<FileUploadStatus, string> = {
    idle: t('materials.statusIdle'),
    uploading: t('materials.statusUploading'),
    error: t('materials.statusError'),
  };

  return (
    <div className='grid gap-6'>
      <div className='grid gap-2'>
        <Label htmlFor='material-title'>{t('materials.titleLabel')}</Label>
        <Input
          id='material-title'
          aria-required='true'
          aria-invalid={Boolean(titleError)}
          placeholder={t('materials.titlePlaceholder')}
          value={draft.title}
          onChange={(event) =>
            onDraftChange({ ...draft, title: event.target.value })
          }
        />
        {titleError ? (
          <p role='alert' className='text-sm text-destructive'>
            {titleError}
          </p>
        ) : null}
      </div>

      <div className='grid gap-2'>
        <Label>{t('materials.attachments')}</Label>
        <FileUploadField
          repository={repository}
          multiple
          value={draft.files}
          onChange={(files) => onDraftChange({ ...draft, files })}
          onError={handleError}
          onStatusChange={setStatus}
          accept={[
            'image/png',
            'image/jpeg',
            '.docx',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          ]}
          labels={{
            choose: t('materials.chooseFiles'),
            empty: t('materials.noAttachments'),
            preview: t('materials.preview'),
            download: t('materials.download'),
            remove: t('materials.remove'),
          }}
        />
        <p className='text-sm text-muted-foreground'>
          {t('materials.attachmentsHint')}
        </p>
        <p role='status' className='text-sm text-muted-foreground'>
          {t('materials.uploadStatus')}: {statusLabel[status]}
        </p>
        {uploadError ? (
          <p role='alert' className='text-sm text-destructive'>
            {uploadError}
          </p>
        ) : null}
      </div>

      {draft.files.length ? (
        <div className='grid gap-4'>
          {draft.files.map((file) => (
            <UploadedFilePreview key={file.id} file={file} />
          ))}
        </div>
      ) : null}

      {savedAttachments.length ? (
        <div className='grid gap-4'>
          <Separator />
          {savedAttachments.map((attachment) => (
            <SavedAttachment
              key={attachment.id}
              attachment={attachment}
              onRemove={() => onRemoveSavedAttachment?.(attachment.id)}
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}

      <div className='flex items-center gap-2'>
        <Button
          type='button'
          disabled={saving || status === 'uploading'}
          onClick={() => void onSave()}
        >
          {saving ? (
            <LoaderCircle aria-hidden='true' className='animate-spin' />
          ) : null}
          {saving ? t('materials.saving') : (saveLabel ?? t('materials.save'))}
        </Button>
      </div>
    </div>
  );
}

/** The actual content of a file that was just uploaded and is not saved with a material yet. */
function UploadedFilePreview(inputProps: {
  readonly file: FileRecord;
}): ReactElement {
  const { t } = useTranslation();
  const { file } = inputProps;
  const kind = useMemo(() => resolveFilePreviewKind(file), [file]);
  return (
    <div className='rounded-lg border border-border p-4'>
      <div className='mb-3 flex items-center justify-between gap-3'>
        <span className='truncate text-sm font-medium'>{file.filename}</span>
        <span className='text-xs text-muted-foreground'>
          {t('materials.statusUploaded')}
        </span>
      </div>
      <FilePreviewContent file={file} kind={kind} url={file.contentUrl} />
    </div>
  );
}

/** An attachment already stored on the material, with its real content and a remove action. */
function SavedAttachment(inputProps: {
  readonly attachment: MaterialAttachment;
  readonly onRemove: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { attachment, onRemove } = inputProps;
  const kind = useMemo(
    () => resolveFilePreviewKind(attachment as unknown as FileRecord),
    [attachment],
  );
  return (
    <div className='rounded-lg border border-border p-4'>
      <div className='mb-3 flex items-center justify-between gap-3'>
        <span className='truncate text-sm font-medium'>
          {attachment.filename}
        </span>
        <div className='flex shrink-0 items-center gap-2'>
          <a
            href={attachment.contentUrl}
            download={attachment.filename}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {t('materials.download')}
          </a>
          <Button type='button' variant='outline' size='sm' onClick={onRemove}>
            {t('materials.remove')}
          </Button>
        </div>
      </div>
      <FilePreviewContent
        file={attachment as unknown as FileRecord}
        kind={kind}
        url={attachment.contentUrl}
      />
    </div>
  );
}

/** A saved material rendered as a card in the list. */
export function MaterialCardBody(inputProps: {
  readonly material: Material;
}): ReactElement {
  const { t } = useTranslation();
  const { material } = inputProps;
  return (
    <div className='flex flex-col gap-1'>
      <span className='font-medium'>{material.title}</span>
      <span className='text-sm text-muted-foreground'>
        {t('materials.attachmentCount', {
          count: material.attachments.length,
        })}
      </span>
    </div>
  );
}
