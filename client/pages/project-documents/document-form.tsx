import { useTranslation } from '@nocobase/i18n/client';
import { type FormEvent, type ReactElement, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  FileUploadField,
  type ClientFileRepository,
  type FileRecord,
  type FileUploadStatus,
} from '@/extensions/nocobase-file-component-ui';

import { DOCUMENT_ACCEPT } from './document-api';

export interface DocumentFormSubmission {
  readonly title: string;
  readonly files: readonly FileRecord[];
}

export interface DocumentFormProps {
  readonly repository: ClientFileRepository;
  /** The document being edited, absent when creating one. */
  readonly title?: string;
  readonly files?: readonly FileRecord[];
  readonly saving: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /**
   * Saves the draft. The page reports a failure itself and keeps this dialog
   * open, so the uploaded attachments survive a missing title and the user can
   * correct it and save without uploading again.
   */
  readonly onSubmit: (submission: DocumentFormSubmission) => void;
  readonly onUploadStatusChange?: (status: FileUploadStatus) => void;
  readonly onUploadError: (error: Error) => void;
}

/**
 * The create and edit dialog: a title and the attachments the document carries.
 *
 * The uploaded records live in this component's state until the page saves
 * them, so a rejected save — a missing title, say — leaves them in place.
 */
export function DocumentForm(inputProps: DocumentFormProps): ReactElement {
  const { t } = useTranslation();
  const {
    repository,
    title: initialTitle = '',
    files: initialFiles = [],
    saving,
    onOpenChange,
    onSubmit,
    onUploadStatusChange,
    onUploadError,
  } = inputProps;

  const titleId = useId();
  const [title, setTitle] = useState(initialTitle);
  const [files, setFiles] = useState<readonly FileRecord[]>(initialFiles);
  const [titleInvalid, setTitleInvalid] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<FileUploadStatus>('idle');

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleInvalid(true);
      return;
    }
    setTitleInvalid(false);
    onSubmit({ title: trimmed, files });
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>
              {initialTitle
                ? t('projectDocuments.editTitle')
                : t('projectDocuments.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('projectDocuments.formDescription')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-6'>
            <Field data-invalid={titleInvalid ? true : undefined}>
              <FieldLabel htmlFor={titleId}>
                {t('projectDocuments.field.title')}
              </FieldLabel>
              <Input
                id={titleId}
                value={title}
                maxLength={255}
                aria-invalid={titleInvalid ? true : undefined}
                placeholder={t('projectDocuments.field.titlePlaceholder')}
                onChange={(event) => {
                  setTitle(event.currentTarget.value);
                  if (titleInvalid) setTitleInvalid(false);
                }}
              />
              <FieldDescription>
                {t('projectDocuments.field.titleDescription')}
              </FieldDescription>
              <FieldError>
                {titleInvalid
                  ? t('projectDocuments.error.titleRequired')
                  : null}
              </FieldError>
            </Field>
            <Field>
              <FieldLabel>{t('projectDocuments.field.attachments')}</FieldLabel>
              <FileUploadField
                repository={repository}
                value={files}
                onChange={setFiles}
                multiple
                accept={DOCUMENT_ACCEPT}
                removeOnDelete={false}
                disabled={saving}
                onStatusChange={(status) => {
                  setUploadStatus(status);
                  onUploadStatusChange?.(status);
                }}
                onError={onUploadError}
              />
              <FieldDescription>
                {t('projectDocuments.field.attachmentsDescription')}
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type='submit'
              disabled={saving || uploadStatus === 'uploading'}
            >
              {saving ? t('projectDocuments.saving') : t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
