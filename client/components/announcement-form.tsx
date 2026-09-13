import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CreateAnnouncementInput } from '@/hooks/use-announcements';

const MAX_TITLE_LENGTH = 200;

export interface AnnouncementFormProps {
  /** Returns `true` when the announcement was stored and the form should clear itself. */
  readonly onSubmit: (input: CreateAnnouncementInput) => Promise<boolean>;
  /** An already-translated error from the server, shown next to the fields. */
  readonly serverError?: string;
}

export function AnnouncementForm({
  onSubmit,
  serverError,
}: AnnouncementFormProps): ReactElement {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [validationError, setValidationError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();

    if (trimmedTitle.length === 0) {
      setValidationError(
        t('announcements.error.titleRequired', {
          defaultValue: 'Enter a title.',
        }),
      );
      return;
    }
    if (trimmedTitle.length > MAX_TITLE_LENGTH) {
      setValidationError(
        t('announcements.error.titleTooLong', {
          defaultValue: 'Keep the title under 200 characters.',
        }),
      );
      return;
    }
    if (trimmedBody.length === 0) {
      setValidationError(
        t('announcements.error.bodyRequired', {
          defaultValue: 'Enter a body.',
        }),
      );
      return;
    }

    setValidationError(undefined);
    setSubmitting(true);
    try {
      const succeeded = await onSubmit({
        title: trimmedTitle,
        body: trimmedBody,
      });
      if (succeeded) {
        setTitle('');
        setBody('');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const error = validationError ?? serverError;

  return (
    <section className='rounded-lg border border-border bg-card p-5'>
      <h2 className='font-heading text-lg font-semibold'>
        {t('announcements.form.heading', {
          defaultValue: 'New announcement',
        })}
      </h2>
      <form
        className='mt-4 space-y-4'
        noValidate
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className='space-y-2'>
          <Label htmlFor='announcement-title'>
            {t('announcements.form.titleLabel', { defaultValue: 'Title' })}
          </Label>
          <Input
            id='announcement-title'
            maxLength={MAX_TITLE_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('announcements.form.titlePlaceholder', {
              defaultValue: 'A short summary',
            })}
            value={title}
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='announcement-body'>
            {t('announcements.form.bodyLabel', { defaultValue: 'Body' })}
          </Label>
          <Textarea
            id='announcement-body'
            onChange={(event) => setBody(event.target.value)}
            placeholder={t('announcements.form.bodyPlaceholder', {
              defaultValue: 'Write the announcement…',
            })}
            rows={5}
            value={body}
          />
        </div>
        {error ? (
          <p className='text-sm text-destructive' role='alert'>
            {error}
          </p>
        ) : null}
        <Button disabled={submitting} type='submit'>
          {submitting
            ? t('announcements.form.submitting', {
                defaultValue: 'Publishing…',
              })
            : t('announcements.form.submit', { defaultValue: 'Publish' })}
        </Button>
      </form>
    </section>
  );
}
