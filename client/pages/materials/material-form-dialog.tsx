import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';

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
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

import { createMaterial, updateMaterial } from './materials-api.js';
import type { MaterialDetail, MaterialInput } from './types.js';

export interface MaterialFormDialogProps {
  /** Present when editing; absent when creating. */
  readonly material?: MaterialDetail;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: (material: MaterialDetail) => void;
}

/** The create and edit form for one document, in a dialog. */
export function MaterialFormDialog({
  material,
  onOpenChange,
  onSaved,
}: MaterialFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [title, setTitle] = useState(material?.title ?? '');
  const [content, setContent] = useState(material?.content ?? '');
  const [published, setPublished] = useState(material?.published ?? false);
  const [confidential, setConfidential] = useState(
    material?.confidential ?? false,
  );
  const [submitting, setSubmitting] = useState(false);

  const editing = material !== undefined;
  const canSubmit = title.trim().length > 0 && !submitting;

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;
    const input: MaterialInput = {
      title: title.trim(),
      content,
      published,
      confidential,
    };
    setSubmitting(true);
    try {
      const saved =
        editing && material
          ? await updateMaterial(api, material.id, input)
          : await createMaterial(api, input);
      toaster.show({
        type: 'success',
        title: editing ? t('materials.saved') : t('materials.created'),
      });
      onSaved(saved);
      onOpenChange(false);
    } catch {
      toaster.show({ type: 'error', title: t('materials.saveFailed') });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl' showCloseButton>
        <DialogHeader>
          <DialogTitle>
            {editing ? t('materials.editTitle') : t('materials.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('materials.formDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(event) => void handleSubmit(event)}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='material-title'>
                {t('materials.field.title')}
              </FieldLabel>
              <Input
                id='material-title'
                value={title}
                maxLength={255}
                required
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='material-content'>
                {t('materials.field.content')}
              </FieldLabel>
              <Textarea
                id='material-content'
                value={content}
                rows={8}
                onChange={(event) => setContent(event.target.value)}
              />
            </Field>
            <Field>
              <label className='flex items-center gap-2 text-sm font-medium'>
                <input
                  type='checkbox'
                  className='size-4 rounded border-input accent-primary'
                  checked={published}
                  onChange={(event) => setPublished(event.target.checked)}
                />
                {t('materials.field.published')}
              </label>
              <FieldDescription>
                {t('materials.field.publishedHint')}
              </FieldDescription>
            </Field>
            <Field>
              <label className='flex items-center gap-2 text-sm font-medium'>
                <input
                  type='checkbox'
                  className='size-4 rounded border-input accent-primary'
                  checked={confidential}
                  onChange={(event) => setConfidential(event.target.checked)}
                />
                {t('materials.field.confidential')}
              </label>
              <FieldDescription>
                {t('materials.field.confidentialHint')}
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('actions.cancel')}
            </Button>
            <Button type='submit' disabled={!canSubmit}>
              {submitting ? <Spinner /> : null}
              {submitting ? t('materials.saving') : t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
