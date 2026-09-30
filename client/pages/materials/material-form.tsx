import { useApiClient, useService, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { FileRecord } from '../../extensions/nocobase-file-component-ui/index.js';
import {
  useCallback,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';

import {
  clientFileRepositoryManagerToken,
  FileUploadField,
} from '../../extensions/nocobase-file-component-ui/index.js';
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { createMaterial, updateMaterial } from './material-api.js';
import type { Material } from './types.js';

/**
 * The create and edit form for a material: one required title and a set of already-uploaded attachments.
 *
 * Uploading and saving are two different submissions, which is the behaviour the product asks for. A file is
 * uploaded to the File Repository the moment it is chosen, so a save rejected for a missing title leaves both the
 * upload and the selection untouched — the same `FileRecord`s stay in state and the next save links them without a
 * second upload. Removing a record here only unlinks it; the File Repository's metadata is kept, because the
 * product asks for detachment, not destruction.
 */

export interface MaterialFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly material?: Material;
  readonly onSaved: (material: Material) => void;
}

const ACCEPTED_EXTENSIONS: readonly string[] = ['.png', '.docx'];
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

export function MaterialFormDialog({
  open,
  onOpenChange,
  material,
  onSaved,
}: MaterialFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository('materialAttachments'),
    [manager],
  );

  const [title, setTitle] = useState(material?.title ?? '');
  const [files, setFiles] = useState<readonly FileRecord[]>(
    material?.attachments ?? [],
  );
  const [titleError, setTitleError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<
    'idle' | 'uploading' | 'error'
  >('idle');

  const reportUploadError = useCallback(
    (error: Error) => {
      toaster.show({
        type: 'error',
        title: t('materials.uploadFailed'),
        description: error.message,
      });
    },
    [t, toaster],
  );

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      setTitleError(true);
      return;
    }
    if (uploadStatus === 'uploading') {
      toaster.show({ type: 'info', title: t('materials.waitForUpload') });
      return;
    }

    const input = { title: nextTitle, attachmentIds: files.map((f) => f.id) };
    setSaving(true);
    try {
      const saved = material
        ? await updateMaterial(api, material.id, input)
        : await createMaterial(api, input);
      setSaving(false);
      toaster.show({
        type: 'success',
        title: material ? t('materials.updated') : t('materials.created'),
      });
      onSaved(saved);
    } catch (cause) {
      setSaving(false);
      toaster.show({
        type: 'error',
        title: t('materials.saveFailed'),
        description: cause instanceof Error ? cause.message : undefined,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {material ? t('materials.editTitle') : t('materials.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('materials.formDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className='space-y-6'
          onSubmit={(event) => void submit(event)}
        >
          <FieldGroup>
            <Field data-invalid={titleError ? true : undefined}>
              <FieldLabel htmlFor='material-title'>
                {t('materials.titleLabel')}
              </FieldLabel>
              <Input
                id='material-title'
                value={title}
                aria-invalid={titleError ? true : undefined}
                placeholder={t('materials.titlePlaceholder')}
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (event.target.value.trim()) setTitleError(false);
                }}
              />
              <FieldError>
                {titleError ? t('materials.titleRequired') : undefined}
              </FieldError>
            </Field>
            <Field>
              <FieldLabel>{t('materials.attachmentsLabel')}</FieldLabel>
              <FileUploadField
                repository={repository}
                value={files}
                onChange={setFiles}
                onError={reportUploadError}
                onStatusChange={setUploadStatus}
                multiple
                accept={ACCEPTED_EXTENSIONS}
                maxSize={MAX_ATTACHMENT_SIZE}
                disabled={saving}
              />
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
            <Button type='submit' disabled={saving}>
              {saving ? t('actions.saving') : t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
