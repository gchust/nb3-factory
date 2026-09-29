import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type FormEvent, type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
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

import {
  TICKET_CATEGORIES,
  type ItTicketsOutletContext,
  type ItTicketView,
  type TicketCategory,
} from './types.js';

const FORM_ID = 'it-ticket-new-form';

type FieldName = 'title' | 'category' | 'description';

/** Route `/it-tickets/new`: the create dialog for an employee's own ticket. */
export default function NewItTicketPage(): ReactElement {
  const { t } = useTranslation();
  // The state disables the buttons; the ref is what beforeClose reads: after a successful save the new state value
  // has not rendered yet when close() runs.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  return (
    <RouteDialog
      title={t('itTickets.create.title')}
      description={t('itTickets.create.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<NewItTicketFooter submitting={submitting} />}
    >
      <NewItTicketBody
        onSubmittingChange={(value) => {
          submittingRef.current = value;
          setSubmitting(value);
        }}
      />
    </RouteDialog>
  );
}

function NewItTicketBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<ItTicketsOutletContext>();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TicketCategory | ''>('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [submitError, setSubmitError] = useState<string>();
  // Guards against a second submit before the disabled state has rendered.
  const submittingGuardRef = useRef(false);

  function validate(): boolean {
    const next: Partial<Record<FieldName, string>> = {};
    if (title.trim() === '') {
      next.title = t('itTickets.validation.titleRequired');
    }
    if (category === '') {
      next.category = t('itTickets.validation.categoryRequired');
    }
    if (description.trim() === '') {
      next.description = t('itTickets.validation.descriptionRequired');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (submittingGuardRef.current) return;
    if (!validate()) return;
    submittingGuardRef.current = true;
    onSubmittingChange(true);
    setSubmitError(undefined);
    try {
      await api.request<{ data: ItTicketView }>({
        path: 'it-tickets',
        method: 'POST',
        json: { title, category, description },
      });
      toaster.show({
        type: 'success',
        title: t('itTickets.create.success'),
      });
      submittingGuardRef.current = false;
      onSubmittingChange(false);
      reload();
      void close();
    } catch (error) {
      submittingGuardRef.current = false;
      onSubmittingChange(false);
      setSubmitError(
        error instanceof ApiClientError && error.status === 403
          ? t('itTickets.error.forbidden')
          : t('itTickets.error.requestFailed'),
      );
    }
  }

  return (
    <form
      id={FORM_ID}
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
    >
      <FieldGroup>
        <Field data-invalid={errors.title ? true : undefined}>
          <FieldLabel htmlFor='it-ticket-title'>
            {t('itTickets.fields.title')}
          </FieldLabel>
          <Input
            id='it-ticket-title'
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('itTickets.create.titlePlaceholder')}
            aria-invalid={errors.title ? true : undefined}
          />
          <FieldError>{errors.title}</FieldError>
        </Field>

        <Field data-invalid={errors.category ? true : undefined}>
          <FieldLabel htmlFor='it-ticket-category'>
            {t('itTickets.fields.category')}
          </FieldLabel>
          <Select
            value={category === '' ? null : category}
            onValueChange={(value: string | null) =>
              setCategory((value ?? '') as TicketCategory | '')
            }
          >
            <SelectTrigger id='it-ticket-category' className='w-full'>
              <SelectValue
                placeholder={t('itTickets.create.categoryPlaceholder')}
              />
            </SelectTrigger>
            <SelectContent>
              {TICKET_CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`itTickets.category.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError>{errors.category}</FieldError>
        </Field>

        <Field data-invalid={errors.description ? true : undefined}>
          <FieldLabel htmlFor='it-ticket-description'>
            {t('itTickets.fields.description')}
          </FieldLabel>
          <Textarea
            id='it-ticket-description'
            rows={5}
            value={description}
            maxLength={5000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('itTickets.create.descriptionPlaceholder')}
            aria-invalid={errors.description ? true : undefined}
          />
          <FieldDescription>
            {t('itTickets.create.descriptionHint')}
          </FieldDescription>
          <FieldError>{errors.description}</FieldError>
        </Field>
      </FieldGroup>

      {submitError ? (
        <Alert variant='destructive' className='mt-4'>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

function NewItTicketFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();

  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('itTickets.create.submit')}
      </Button>
    </>
  );
}
