import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon, TriangleAlertIcon } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

import { FileUploadField } from '@/extensions/nocobase-file-component-ui';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

import { createMaterial } from './api.js';
import {
  MATERIAL_ACCEPT,
  MATERIAL_MAX_SIZE,
  useMaterialFileRepository,
} from './files.js';
import type { Material, MaterialFile } from './types.js';

export interface CreateMaterialDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: (material: Material) => void;
}

/**
 * The create flow: a title and any number of already-uploaded attachments.
 *
 * The dialog is mounted fresh for each open — the page gives it a new key —
 * so its state starts empty without an effect resetting it.
 *
 * The attachments are uploaded as soon as they are chosen and stay in local
 * state, so a save that the server rejects — most often for a missing title —
 * leaves them in the form. Filling the title and submitting again sends the
 * same ids, which binds the files that are already stored instead of uploading
 * them a second time.
 */
export function CreateMaterialDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateMaterialDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const repository = useMaterialFileRepository();
  const toaster = useToaster();
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<readonly MaterialFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [titleError, setTitleError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const value = title.trim();
    if (!value) {
      setTitleError(t('materials.errors.titleRequired'));
      return;
    }
    setSaving(true);
    setFormError(undefined);
    try {
      const material = await createMaterial(api, {
        title: value,
        fileIds: files.map((file) => file.id),
      });
      toaster.show({
        type: 'success',
        title: t('materials.notices.created'),
        description: material.title,
      });
      onCreated(material);
      onOpenChange(false);
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.code === 'VALIDATION_TITLE_REQUIRED'
      ) {
        setTitleError(t('materials.errors.titleRequired'));
      } else {
        setFormError(t('materials.errors.saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className='space-y-6' onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t('materials.createTitle')}</DialogTitle>
            <DialogDescription>
              {t('materials.createDescription')}
            </DialogDescription>
          </DialogHeader>
          {formError ? (
            <Alert variant='destructive'>
              <TriangleAlertIcon aria-hidden='true' />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
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
                if (titleError) setTitleError(undefined);
              }}
            />
            {titleError ? <FieldError>{titleError}</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel>{t('materials.attachments')}</FieldLabel>
            <FileUploadField
              repository={repository}
              value={files}
              onChange={setFiles}
              multiple
              accept={MATERIAL_ACCEPT}
              maxSize={MATERIAL_MAX_SIZE}
              labels={{
                choose: t('materials.chooseFiles'),
                remove: t('materials.remove'),
              }}
              onStatusChange={(status) => setUploading(status === 'uploading')}
              onError={(error) => {
                toaster.show({
                  type: 'error',
                  title: t('materials.errors.uploadRejected'),
                  description: error.message,
                });
              }}
            />
          </Field>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t('actions.cancel')}
            </Button>
            <Button type='submit' disabled={saving || uploading}>
              <PlusIcon aria-hidden='true' />
              {saving ? t('materials.creating') : t('materials.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
