import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Textarea } from '#components/ui/textarea';

import { createDocument, updateDocument } from './api.js';
import { libraryKeys } from './queries.js';
import type { LibraryDocument, LibraryDocumentInput } from './types.js';

export interface DocumentFormProps {
  readonly document?: LibraryDocument;
  readonly closeTo: string;
}

export function DocumentForm({
  document,
  closeTo,
}: DocumentFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formId = useId();
  const [title, setTitle] = useState(document?.title ?? '');
  const [body, setBody] = useState(document?.body ?? '');
  const [published, setPublished] = useState(document?.published ?? false);
  const [confidential, setConfidential] = useState(
    document?.confidential ?? false,
  );
  const editing = Boolean(document);

  const save = useMutation({
    mutationFn: (input: LibraryDocumentInput) =>
      document
        ? updateDocument(api, document.id, input)
        : createDocument(api, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      void navigate(closeTo, { replace: true });
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    save.mutate({
      title: title.trim(),
      body: body.trim(),
      published,
      confidential,
    });
  };

  return (
    <RouteDialog
      title={
        editing ? t('library.form.editTitle') : t('library.form.createTitle')
      }
      description={
        editing
          ? t('library.form.editDescription')
          : t('library.form.createDescription')
      }
      footer={
        <>
          <Button
            disabled={save.isPending}
            variant='outline'
            onClick={() => void navigate(closeTo, { replace: true })}
          >
            {t('library.actions.cancel')}
          </Button>
          <Button disabled={save.isPending} form={formId} type='submit'>
            {save.isPending
              ? editing
                ? t('library.actions.saving')
                : t('library.actions.creating')
              : editing
                ? t('library.actions.save')
                : t('library.actions.create')}
          </Button>
        </>
      }
    >
      <form className='flex flex-col gap-5' id={formId} onSubmit={submit}>
        {save.isError ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {save.error instanceof Error
                ? save.error.message
                : t('library.form.error')}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className='flex flex-col gap-2'>
          <Label htmlFor={`${formId}-title`}>{t('library.form.title')}</Label>
          <Input
            id={`${formId}-title`}
            maxLength={200}
            placeholder={t('library.form.titlePlaceholder')}
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className='flex flex-col gap-2'>
          <Label htmlFor={`${formId}-body`}>{t('library.form.body')}</Label>
          <Textarea
            className='min-h-56'
            id={`${formId}-body`}
            placeholder={t('library.form.bodyPlaceholder')}
            required
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>

        <div className='flex flex-col gap-3'>
          <label className='flex cursor-pointer items-start gap-3 rounded-lg border p-3'>
            <Checkbox
              checked={published}
              className='mt-0.5'
              onCheckedChange={setPublished}
            />
            <span className='flex flex-col gap-0.5'>
              <span className='text-sm font-medium'>
                {t('library.form.published')}
              </span>
              <span className='text-sm text-muted-foreground'>
                {t('library.form.publishedHint')}
              </span>
            </span>
          </label>
          <label className='flex cursor-pointer items-start gap-3 rounded-lg border p-3'>
            <Checkbox
              checked={confidential}
              className='mt-0.5'
              onCheckedChange={setConfidential}
            />
            <span className='flex flex-col gap-0.5'>
              <span className='text-sm font-medium'>
                {t('library.form.confidential')}
              </span>
              <span className='text-sm text-muted-foreground'>
                {t('library.form.confidentialHint')}
              </span>
            </span>
          </label>
        </div>
      </form>
    </RouteDialog>
  );
}
