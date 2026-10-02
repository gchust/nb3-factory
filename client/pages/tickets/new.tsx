import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type FormEvent, type ReactElement, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { createTicket } from './ticket-api.js';
import { TICKET_CATEGORIES, type TicketCategory } from './types.js';

export default function NewTicketPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const navigate = useNavigate();
  const location = useLocation();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TicketCategory>('computer');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t('tickets.create.titleRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    createTicket(api, {
      title: trimmedTitle,
      category,
      description: description.trim(),
    })
      .then(() => {
        toaster.show({ type: 'success', title: t('tickets.create.created') });
        void navigate({ pathname: '..', search: location.search });
      })
      .catch(() => {
        setError(t('tickets.create.failed'));
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <RouteDialog
      title={t('tickets.create.title')}
      description={t('tickets.create.description')}
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() =>
              void navigate({ pathname: '..', search: location.search })
            }
          >
            {t('actions.cancel')}
          </Button>
          <Button type='submit' form='create-ticket-form' disabled={submitting}>
            {submitting
              ? t('tickets.create.submitting')
              : t('tickets.create.submit')}
          </Button>
        </>
      }
    >
      <form id='create-ticket-form' onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor='ticket-title'>
              {t('tickets.create.field.title')}
            </FieldLabel>
            <Input
              id='ticket-title'
              required
              maxLength={255}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('tickets.create.field.titlePlaceholder')}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='ticket-category'>
              {t('tickets.create.field.category')}
            </FieldLabel>
            <Select
              value={category}
              onValueChange={(value: string | null) =>
                setCategory((value ?? 'other') as TicketCategory)
              }
            >
              <SelectTrigger id='ticket-category' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_CATEGORIES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`tickets.category.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor='ticket-description'>
              {t('tickets.create.field.description')}
            </FieldLabel>
            <Textarea
              id='ticket-description'
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('tickets.create.field.descriptionPlaceholder')}
            />
          </Field>
          {error ? (
            <p className='text-sm text-destructive' role='alert'>
              {error}
            </p>
          ) : null}
        </FieldGroup>
      </form>
    </RouteDialog>
  );
}
