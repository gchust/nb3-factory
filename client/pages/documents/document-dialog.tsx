import { useTranslation } from '@nocobase/i18n/client';
import { type FormEvent, type ReactElement, useState } from 'react';

import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Spinner } from '#components/ui/spinner';
import { Textarea } from '#components/ui/textarea';

import type { DocumentInput, DocumentRecord } from './types.js';

export type DocumentDialogMode = 'create' | 'edit' | 'view';

export interface DocumentDialogProps {
  readonly mode: DocumentDialogMode;
  readonly document?: DocumentRecord;
  readonly open: boolean;
  readonly pending: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (input: DocumentInput) => void;
}

const EMPTY: DocumentInput = {
  title: '',
  body: '',
  published: false,
  confidential: false,
};

export function DocumentDialog({
  mode,
  document,
  open,
  pending,
  onOpenChange,
  onSubmit,
}: DocumentDialogProps): ReactElement {
  const { t } = useTranslation();
  const readOnly = mode === 'view';
  // The page remounts this dialog for each document and mode, so the initial value is always the one being edited.
  const [input, setInput] = useState<DocumentInput>(() =>
    document
      ? {
          title: document.title,
          body: document.body,
          published: document.published,
          confidential: document.confidential,
        }
      : EMPTY,
  );

  const titleKey =
    mode === 'create'
      ? 'documents.form.createTitle'
      : mode === 'edit'
        ? 'documents.form.editTitle'
        : 'documents.form.viewTitle';

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (readOnly) return;
    onSubmit({
      ...input,
      title: input.title.trim(),
      body: input.body.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='gap-5 sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>
            {mode === 'view'
              ? t('documents.form.viewDescription')
              : t('documents.form.description')}
          </DialogDescription>
        </DialogHeader>
        <form className='flex flex-col gap-4' onSubmit={submit}>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='document-title'>{t('documents.form.title')}</Label>
            <Input
              id='document-title'
              required
              maxLength={255}
              disabled={readOnly || pending}
              value={input.title}
              onChange={(event) =>
                setInput((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='document-body'>{t('documents.form.body')}</Label>
            <Textarea
              id='document-body'
              required
              disabled={readOnly || pending}
              className='min-h-48 resize-y'
              value={input.body}
              onChange={(event) =>
                setInput((current) => ({
                  ...current,
                  body: event.target.value,
                }))
              }
            />
          </div>
          <div className='flex flex-wrap gap-x-6 gap-y-3'>
            <label className='flex cursor-pointer items-center gap-2 text-sm'>
              <input
                type='checkbox'
                className='size-4 accent-primary'
                disabled={readOnly || pending}
                checked={input.published}
                onChange={(event) =>
                  setInput((current) => ({
                    ...current,
                    published: event.target.checked,
                  }))
                }
              />
              {t('documents.form.published')}
            </label>
            <label className='flex cursor-pointer items-center gap-2 text-sm'>
              <input
                type='checkbox'
                className='size-4 accent-primary'
                disabled={readOnly || pending}
                checked={input.confidential}
                onChange={(event) =>
                  setInput((current) => ({
                    ...current,
                    confidential: event.target.checked,
                  }))
                }
              />
              {t('documents.form.confidential')}
            </label>
          </div>
          {readOnly && document ? (
            <dl className='grid gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm'>
              <div className='flex justify-between gap-4'>
                <dt className='text-muted-foreground'>
                  {t('documents.form.owner')}
                </dt>
                <dd className='font-mono text-xs'>{document.ownerId}</dd>
              </div>
              <div className='flex justify-between gap-4'>
                <dt className='text-muted-foreground'>
                  {t('documents.form.updatedAt')}
                </dt>
                <dd>{new Date(document.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
          ) : null}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {readOnly ? t('actions.close') : t('actions.cancel')}
            </Button>
            {readOnly ? null : (
              <Button type='submit' disabled={pending}>
                {pending ? <Spinner /> : null}
                {mode === 'create'
                  ? t('documents.form.create')
                  : t('actions.save')}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
