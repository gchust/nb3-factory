import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type FormEvent, type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

import { createItTicket } from './api.js';
import {
  IT_TICKET_CATEGORIES,
  isItTicketCategory,
  type ItSupportOutletContext,
} from './types.js';

const FORM_ID = 'it-ticket-create-form';
const MAX_TITLE_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 5000;

/** Route `/it-support/new`: submit a new repair ticket. */
export default function CreateItTicketPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  // The ref is what `beforeClose` reads: when `close()` runs right after a successful save the new state has not rendered yet.
  const submittingRef = useRef(false);
  const setSubmittingBoth = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('itSupport.create.title')}
      description={t('itSupport.create.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<CreateFooter submitting={submitting} />}
    >
      <CreateBody onSubmittingChange={setSubmittingBoth} />
    </RouteDialog>
  );
}

function CreateBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<ItSupportOutletContext>();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle === '') {
      setError(t('itSupport.create.titleRequired'));
      return;
    }
    if (!isItTicketCategory(category)) {
      setError(t('itSupport.create.categoryRequired'));
      return;
    }
    setError(undefined);
    onSubmittingChange(true);
    try {
      await createItTicket(api, {
        title: trimmedTitle,
        category,
        description: description.trim() || undefined,
      });
      toaster.show({ type: 'success', title: t('itSupport.create.success') });
      onSubmittingChange(false);
      reload();
      void close();
    } catch (caught: unknown) {
      if (caught instanceof ApiClientError && caught.status === 403) {
        setError(t('itSupport.error.forbidden'));
      } else {
        setError(t('itSupport.error.requestFailed'));
      }
      onSubmittingChange(false);
    }
  }

  return (
    <form
      id={FORM_ID}
      className='flex flex-col gap-5'
      onSubmit={(event) => void submit(event)}
    >
      <Field>
        <FieldLabel htmlFor='it-ticket-title'>
          {t('itSupport.column.title')}
        </FieldLabel>
        <Input
          id='it-ticket-title'
          value={title}
          maxLength={MAX_TITLE_LENGTH}
          autoComplete='off'
          required
          aria-invalid={error === t('itSupport.create.titleRequired')}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor='it-ticket-category'>
          {t('itSupport.column.category')}
        </FieldLabel>
        <Select
          value={category === '' ? null : category}
          onValueChange={(value: string | null) => setCategory(value ?? '')}
        >
          <SelectTrigger id='it-ticket-category' className='w-full'>
            <SelectValue
              placeholder={t('itSupport.create.categoryPlaceholder')}
            />
          </SelectTrigger>
          <SelectContent>
            {IT_TICKET_CATEGORIES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`itSupport.category.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor='it-ticket-description'>
          {t('itSupport.field.description')}
        </FieldLabel>
        <Textarea
          id='it-ticket-description'
          value={description}
          maxLength={MAX_DESCRIPTION_LENGTH}
          rows={5}
          placeholder={t('itSupport.create.descriptionPlaceholder')}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>

      {error ? <FieldError>{error}</FieldError> : null}
    </form>
  );
}

function CreateFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting || isClosing}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting
          ? t('itSupport.create.submitting')
          : t('itSupport.create.submit')}
      </Button>
    </>
  );
}
