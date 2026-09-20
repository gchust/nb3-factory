import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

import {
  errorCode,
  type MaterialDetailDto,
  type MaterialFormValues,
  type SelectableUserDto,
  type Visibility,
} from './api.js';
import { Alert } from './components.js';

export interface MaterialFormDialogProps {
  readonly initial: MaterialDetailDto | null;
  readonly users: readonly SelectableUserDto[];
  readonly onSubmit: (values: MaterialFormValues) => Promise<void>;
  readonly onClose: () => void;
}

const EMPTY: MaterialFormValues = {
  title: '',
  category: '',
  owner: '',
  summary: '',
  borrowable: true,
  totalCopies: 1,
  visibility: 'all',
  readers: [],
};

/**
 * Mounted only while it is open, so the form state is initialized from `initial` on each open
 * instead of being reset by an effect.
 */
export function MaterialFormDialog({
  initial,
  users,
  onSubmit,
  onClose,
}: MaterialFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const [values, setValues] = useState<MaterialFormValues>(() =>
    initial
      ? {
          title: initial.title,
          category: initial.category ?? '',
          owner: initial.owner ?? '',
          summary: initial.summary ?? '',
          borrowable: initial.borrowable,
          totalCopies: initial.totalCopies,
          visibility: initial.visibility,
          readers: [...initial.readers],
        }
      : EMPTY,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <Key extends keyof MaterialFormValues>(
    key: Key,
    value: MaterialFormValues[Key],
  ): void => setValues((current) => ({ ...current, [key]: value }));

  const toggleReader = (userId: string): void => {
    setValues((current) => ({
      ...current,
      readers: current.readers.includes(userId)
        ? current.readers.filter((id) => id !== userId)
        : [...current.readers, userId],
    }));
  };

  const submit = async (): Promise<void> => {
    if (values.title.trim().length === 0) {
      setError(t('library.form.titleRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        ...values,
        title: values.title.trim(),
        category: values.category.trim(),
        owner: values.owner.trim(),
        summary: values.summary.trim(),
      });
      onClose();
    } catch (cause) {
      const code = errorCode(cause);
      setError(
        code === 'FORBIDDEN'
          ? t('library.error.forbidden')
          : t('library.error.generic'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {initial ? t('library.editTitle') : t('library.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('library.form.description')}</DialogDescription>
        </DialogHeader>

        <div className='grid max-h-[65vh] gap-3 overflow-y-auto pr-1'>
          <div className='grid gap-1.5'>
            <Label htmlFor='library-title'>{t('library.form.title')}</Label>
            <Input
              id='library-title'
              onChange={(event) => update('title', event.target.value)}
              value={values.title}
            />
          </div>
          <div className='grid gap-1.5 sm:grid-cols-2 sm:gap-3'>
            <div className='grid gap-1.5'>
              <Label htmlFor='library-category'>
                {t('library.form.category')}
              </Label>
              <Input
                id='library-category'
                onChange={(event) => update('category', event.target.value)}
                value={values.category}
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='library-owner'>{t('library.form.owner')}</Label>
              <Input
                id='library-owner'
                onChange={(event) => update('owner', event.target.value)}
                value={values.owner}
              />
            </div>
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='library-summary'>{t('library.form.summary')}</Label>
            <textarea
              className='min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
              id='library-summary'
              onChange={(event) => update('summary', event.target.value)}
              value={values.summary}
            />
          </div>
          <div className='grid gap-1.5 sm:grid-cols-2 sm:gap-3'>
            <div className='grid gap-1.5'>
              <Label htmlFor='library-copies'>
                {t('library.form.totalCopies')}
              </Label>
              <Input
                id='library-copies'
                min={0}
                onChange={(event) =>
                  update('totalCopies', Number(event.target.value) || 0)
                }
                type='number'
                value={values.totalCopies}
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='library-visibility'>
                {t('library.form.visibility')}
              </Label>
              <select
                className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
                id='library-visibility'
                onChange={(event) =>
                  update('visibility', event.target.value as Visibility)
                }
                value={values.visibility}
              >
                <option value='all'>{t('library.visibility.all')}</option>
                <option value='restricted'>
                  {t('library.visibility.restricted')}
                </option>
              </select>
            </div>
          </div>

          <label className='flex items-center gap-2 text-sm'>
            <input
              checked={values.borrowable}
              className='size-4 rounded border-input'
              onChange={(event) => update('borrowable', event.target.checked)}
              type='checkbox'
            />
            {t('library.form.borrowable')}
          </label>

          {values.visibility === 'restricted' ? (
            <div className='grid gap-1.5'>
              <Label>{t('library.form.readers')}</Label>
              <p className='text-xs text-muted-foreground'>
                {t('library.form.readersHint')}
              </p>
              <div className='max-h-44 overflow-y-auto rounded-lg border border-border'>
                {users.length === 0 ? (
                  <p className='p-3 text-sm text-muted-foreground'>
                    {t('library.form.readersEmpty')}
                  </p>
                ) : (
                  users.map((user) => (
                    <label
                      className='flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0'
                      key={user.id}
                    >
                      <input
                        checked={values.readers.includes(user.id)}
                        className='size-4 rounded border-input'
                        onChange={() => toggleReader(user.id)}
                        type='checkbox'
                      />
                      <span className='min-w-0 truncate'>
                        {user.name || user.username || user.email || user.id}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {error ? <Alert tone='error'>{error}</Alert> : null}
        </div>

        <DialogFooter>
          <Button disabled={saving} onClick={onClose} variant='outline'>
            {t('actions.cancel')}
          </Button>
          <Button disabled={saving} onClick={() => void submit()}>
            {saving ? <Spinner /> : null}
            {saving ? t('library.form.saving') : t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
