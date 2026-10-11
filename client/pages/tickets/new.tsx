import { zodResolver } from '@hookform/resolvers/zod';
import {
  ApiClientError,
  useApiClient,
  useService,
  useToaster,
} from '@nocobase/app-client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { useMemo, useRef, useState, type ReactElement } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useOutletContext } from 'react-router';
import { z } from 'zod';

import { SessionExpiredAlert } from '#components/session-expired-alert';
import { RouteDialog } from '#components/route-dialog';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
import { Input } from '#components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Spinner } from '#components/ui/spinner';
import { Textarea } from '#components/ui/textarea';
import { useRouteOverlay } from '#components/use-route-overlay';
import { FileUploadField } from '#extensions/nocobase-file-component-ui/components/file-upload-field';
import type { FileRecord } from '#extensions/nocobase-file-component-ui/types';

import {
  TICKET_URGENCIES,
  type Ticket,
  type TicketsOutletContext,
} from './types.js';

const FORM_ID = 'ticket-new-form';
const MAX_ATTACHMENTS = 20;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_ACCEPT = ['image/*'] as const;

export default function NewTicketPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('tickets.create.title')}
      description={t('tickets.create.description')}
      className='sm:max-w-xl'
      // No closing while submitting: the × button, Esc, clicking the backdrop and close() all go through beforeClose first.
      beforeClose={() => !submittingRef.current}
      footer={<NewTicketFooter submitting={submitting} />}
    >
      <NewTicketBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function NewTicketFooter({
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
        {submitting ? t('actions.saving') : t('actions.create')}
      </Button>
    </>
  );
}

function NewTicketBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<TicketsOutletContext>();
  const fileManager = useService(clientFileRepositoryManagerToken);
  // The upload field posts each screenshot as it is chosen; the ticket links them by id on submit.
  const repository = useMemo(
    () => fileManager.repository('itTicketFiles'),
    [fileManager],
  );

  const [attachments, setAttachments] = useState<readonly FileRecord[]>([]);
  const [uploadError, setUploadError] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('tickets.form.titleRequired'))
          .max(200, t('tickets.form.titleTooLong', { max: 200 })),
        description: z
          .string()
          .trim()
          .min(1, t('tickets.form.descriptionRequired'))
          .max(20000, t('tickets.form.descriptionTooLong', { max: 20000 })),
        urgency: z.enum(TICKET_URGENCIES),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { title: '', description: '', urgency: 'normal' as const },
  });

  const urgencyItems = TICKET_URGENCIES.map((value) => ({
    value,
    label: t(`tickets.urgency.${value}`),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    onSubmittingChange(true);
    let saved: Ticket;
    try {
      const result = await api.request<{ data: Ticket }>({
        path: 'itTickets',
        method: 'POST',
        json: {
          title: values.title,
          description: values.description,
          urgency: values.urgency,
          attachmentIds: attachments.map((file) => file.id),
        },
      });
      saved = result.data;
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 401) {
        form.setError('root', { type: 'sessionExpired' });
      } else if (
        apiError?.status === 400 &&
        apiError.reason === 'TICKET_INVALID_ATTACHMENT'
      ) {
        form.setError('root', {
          message: t('tickets.error.invalidAttachment'),
        });
      } else if (apiError?.status === 400) {
        form.setError('root', { message: t('tickets.error.invalidInput') });
      } else {
        form.setError('root', { message: t('tickets.error.requestFailed') });
      }
      return;
    } finally {
      onSubmittingChange(false);
    }
    toaster.show({
      type: 'success',
      title: t('tickets.create.success', { id: saved.id }),
    });
    reload();
    void close();
  });

  const rootError = form.formState.errors.root;

  return (
    <form id={FORM_ID} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {rootError?.type === 'sessionExpired' ? (
          <SessionExpiredAlert />
        ) : rootError ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{rootError.message}</AlertDescription>
          </Alert>
        ) : null}
        <Controller
          control={form.control}
          name='title'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${FORM_ID}-title`}>
                {t('tickets.fields.title')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${FORM_ID}-title`}
                autoComplete='off'
                maxLength={200}
                aria-required='true'
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='description'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${FORM_ID}-description`}>
                {t('tickets.fields.description')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Textarea
                {...field}
                id={`${FORM_ID}-description`}
                rows={5}
                maxLength={20000}
                aria-required='true'
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='urgency'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${FORM_ID}-urgency`}>
                {t('tickets.fields.urgency')}
              </FieldLabel>
              <Select
                items={urgencyItems}
                value={field.value}
                onValueChange={(value) => {
                  if (value) field.onChange(value);
                }}
              >
                <SelectTrigger
                  ref={field.ref}
                  id={`${FORM_ID}-urgency`}
                  className='w-full'
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {urgencyItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Field data-invalid={uploadError}>
          <FieldLabel htmlFor={`${FORM_ID}-attachments`}>
            {t('tickets.fields.attachments')}
          </FieldLabel>
          <FileUploadField
            repository={repository}
            value={attachments}
            onChange={(next) => {
              setUploadError(false);
              setAttachments(next);
            }}
            onError={() => setUploadError(true)}
            multiple
            accept={ATTACHMENT_ACCEPT}
            maxSize={MAX_ATTACHMENT_BYTES}
            maxFiles={MAX_ATTACHMENTS}
            labels={{
              choose: t('tickets.form.chooseAttachments'),
              remove: t('tickets.form.removeAttachment'),
              retry: t('tickets.form.retryAttachment'),
            }}
          />
          <FieldDescription>
            {t('tickets.form.attachmentsHint', {
              count: MAX_ATTACHMENTS,
              size: 20,
            })}
          </FieldDescription>
          {uploadError ? (
            <p className='text-sm text-destructive'>
              {t('tickets.form.uploadFailed')}
            </p>
          ) : null}
        </Field>
      </FieldGroup>
    </form>
  );
}
