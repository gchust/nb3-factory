import { useTranslation } from '@nocobase/i18n/client';
import { useId, useState, type FormEvent, type ReactNode } from 'react';

import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Switch } from '#components/ui/switch';
import { Textarea } from '#components/ui/textarea';
import type { DocumentInput } from './types.js';

const EMPTY: DocumentInput = {
  title: '',
  body: '',
  published: false,
  confidential: false,
};

export interface DocumentFormProps {
  readonly initial?: DocumentInput;
  readonly busy: boolean;
  readonly error?: ReactNode;
  readonly submitLabel: string;
  readonly onSubmit: (input: DocumentInput) => void;
  readonly onCancel: () => void;
}

export function DocumentForm({
  initial = EMPTY,
  busy,
  error,
  submitLabel,
  onSubmit,
  onCancel,
}: DocumentFormProps) {
  const { t } = useTranslation();
  const id = useId();
  const [values, setValues] = useState<DocumentInput>(initial);
  const [errors, setErrors] = useState<
    Partial<Record<'title' | 'body', string>>
  >({});

  const update = <K extends keyof DocumentInput>(
    key: K,
    value: DocumentInput[K],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (key === 'title' || key === 'body') {
      setErrors((current) => ({ ...current, [key]: undefined }));
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Partial<Record<'title' | 'body', string>> = {};
    if (!values.title.trim()) next.title = t('documents.form.titleRequired');
    if (!values.body.trim()) next.body = t('documents.form.bodyRequired');
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit({
      ...values,
      title: values.title.trim(),
      body: values.body.trim(),
    });
  };

  return (
    <form className='flex flex-col gap-5' onSubmit={submit}>
      {error}
      <div className='flex flex-col gap-2'>
        <Label htmlFor={`${id}-title`}>{t('documents.form.title')}</Label>
        <Input
          id={`${id}-title`}
          value={values.title}
          maxLength={255}
          autoComplete='off'
          aria-invalid={errors.title ? true : undefined}
          placeholder={t('documents.form.titlePlaceholder')}
          onChange={(event) => update('title', event.target.value)}
        />
        {errors.title && (
          <p className='text-sm text-destructive'>{errors.title}</p>
        )}
      </div>
      <div className='flex flex-col gap-2'>
        <Label htmlFor={`${id}-body`}>{t('documents.form.body')}</Label>
        <Textarea
          id={`${id}-body`}
          value={values.body}
          rows={12}
          maxLength={50_000}
          aria-invalid={errors.body ? true : undefined}
          placeholder={t('documents.form.bodyPlaceholder')}
          className='min-h-64 resize-y'
          onChange={(event) => update('body', event.target.value)}
        />
        {errors.body && (
          <p className='text-sm text-destructive'>{errors.body}</p>
        )}
      </div>
      <div className='flex flex-col divide-y rounded-lg border'>
        <label
          htmlFor={`${id}-published`}
          className='flex cursor-pointer items-start justify-between gap-4 p-4'
        >
          <span>
            <span className='block text-sm font-medium'>
              {t('documents.form.published')}
            </span>
            <span className='mt-1 block text-sm text-muted-foreground'>
              {t('documents.form.publishedHint')}
            </span>
          </span>
          <Switch
            id={`${id}-published`}
            checked={values.published}
            onCheckedChange={(next) => update('published', next)}
          />
        </label>
        <label
          htmlFor={`${id}-confidential`}
          className='flex cursor-pointer items-start justify-between gap-4 p-4'
        >
          <span>
            <span className='block text-sm font-medium'>
              {t('documents.form.confidential')}
            </span>
            <span className='mt-1 block text-sm text-muted-foreground'>
              {t('documents.form.confidentialHint')}
            </span>
          </span>
          <Switch
            id={`${id}-confidential`}
            checked={values.confidential}
            onCheckedChange={(next) => update('confidential', next)}
          />
        </label>
      </div>
      {values.confidential && !values.published && (
        <Alert>
          <AlertDescription>
            {t('documents.form.privateDraftNotice')}
          </AlertDescription>
        </Alert>
      )}
      <div className='flex flex-wrap justify-end gap-2 border-t pt-4'>
        <Button
          variant='outline'
          type='button'
          disabled={busy}
          onClick={onCancel}
        >
          {t('documents.form.cancel')}
        </Button>
        <Button type='submit' disabled={busy}>
          {busy ? t('documents.form.saving') : submitLabel}
        </Button>
      </div>
    </form>
  );
}
