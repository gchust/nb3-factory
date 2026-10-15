import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { FileUploadField } from '#extensions/nocobase-file-component-ui/components/file-upload-field';
import type { FileRecord } from '#extensions/nocobase-file-component-ui/types';
import { Alert, AlertDescription } from '#components/ui/alert';
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
import { Textarea } from '#components/ui/textarea';

import { createTicket } from './api.js';
import { useTicketAttachments } from './use-ticket-attachments.js';
import {
  TICKET_URGENCIES,
  type CreateTicketInput,
  type TicketUrgency,
} from './types.js';

export interface TicketFormProps {
  /** The `<form>` id. When the submit button is outside the form, the button sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save; the form has already shown the success message. */
  readonly onSubmitted: (ticketId: number) => void;
  /** Receives `true` when submission starts and `false` when it ends. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
}

/** The create form shared by the `/tickets/new` dialog. */
export function TicketForm({
  formId,
  onSubmitted,
  onSubmittingChange,
}: TicketFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const attachments = useTicketAttachments();
  // The uploaded files live outside the form state; the schema only carries the text fields.
  const [files, setFiles] = useState<readonly FileRecord[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | undefined>();

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

  const form = useForm<{
    title: string;
    description: string;
    urgency: TicketUrgency;
  }>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      urgency: 'normal' satisfies TicketUrgency,
    },
  });

  const urgencyItems = TICKET_URGENCIES.map((value) => ({
    value,
    label: t(`tickets.urgency.${value}`),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    if (attachments.status === 'uploading') {
      setAttachmentError(t('tickets.form.attachmentsPending'));
      return;
    }

    const input: CreateTicketInput = {
      title: values.title,
      description: values.description,
      urgency: values.urgency,
      attachmentIds: files.map((file) => file.id),
    };

    onSubmittingChange?.(true);
    try {
      const created = await createTicket(api, input);
      toaster.show({
        type: 'success',
        title: t('tickets.create.success', { id: created.id }),
      });
      onSubmitted(created.id);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      form.setError('root', {
        message:
          apiError?.status === 403
            ? t('tickets.form.forbidden')
            : t('tickets.form.submitFailed'),
      });
    } finally {
      onSubmittingChange?.(false);
    }
  });

  const rootError = form.formState.errors.root;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {rootError ? (
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
              <FieldLabel htmlFor={`${formId}-title`}>
                {t('tickets.form.title')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-title`}
                autoComplete='off'
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
              <FieldLabel htmlFor={`${formId}-description`}>
                {t('tickets.form.description')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-description`}
                rows={5}
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
              <FieldLabel htmlFor={`${formId}-urgency`}>
                {t('tickets.form.urgency')}
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
                  id={`${formId}-urgency`}
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
        <Field data-invalid={Boolean(attachmentError)}>
          <FieldLabel htmlFor={`${formId}-attachments`}>
            {t('tickets.form.attachments')}
          </FieldLabel>
          <FileUploadField
            repository={attachments.repository}
            value={files}
            onChange={setFiles}
            onError={(error) => setAttachmentError(error.message)}
            onStatusChange={attachments.onStatusChange}
            multiple
            accept={['image/*']}
            maxSize={5 * 1024 * 1024}
            maxFiles={10}
            removeOnDelete
          />
          <FieldDescription>
            {t('tickets.form.attachmentsHint')}
          </FieldDescription>
          <FieldError
            errors={[
              attachmentError ? { message: attachmentError } : undefined,
            ]}
          />
        </Field>
      </FieldGroup>
    </form>
  );
}
