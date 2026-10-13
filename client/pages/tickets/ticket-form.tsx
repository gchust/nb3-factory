import { zodResolver } from '@hookform/resolvers/zod';
import {
  ApiClientError,
  useApiClient,
  useService,
  useToaster,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, X } from 'lucide-react';
import { type ReactElement, useCallback, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { SessionExpiredAlert } from '#components/session-expired-alert';
import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
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
import { Textarea } from '#components/ui/textarea';
import {
  clientFileRepositoryManagerToken,
  FileUploadField,
  type FileRecord,
  type FileUploadStatus,
} from '#extensions/nocobase-file-component-ui/index';
import {
  createTicket,
  TICKET_URGENCIES,
  type TicketView,
} from '#hooks/service-desk';

import { inspectAttachment } from './attachment-rules.js';

/** The most files one ticket takes, and the largest one; the server refuses more and larger. */
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const ACCEPTED_FILES = [
  'image/*',
  'application/pdf',
  'text/plain',
  '.docx',
  '.xlsx',
  '.log',
] as const;

export interface TicketFormProps {
  /** The `<form>` id. The submit button sits outside the form and links to it through this. */
  readonly formId: string;
  /** Called after a successful save with the ticket the endpoint returned; the success toast is already shown. */
  readonly onSubmitted: (ticket: TicketView) => void;
  /** `true` while the request runs. Reported synchronously so a close guard sees it before the next render. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** `true` while a chosen file is still uploading; the ticket cannot be created before it lands. */
  readonly onUploadingChange?: (uploading: boolean) => void;
}

/**
 * Raising a ticket. The requester is the signed-in caller, so the form only asks what happened: what, where, how
 * urgent, and the screenshots that show it. A screenshot is uploaded first and its file id travels with the ticket.
 */
export function TicketForm({
  formId,
  onSubmitted,
  onSubmittingChange,
  onUploadingChange,
}: TicketFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const fileManager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => fileManager.repository('ticketAttachments'),
    [fileManager],
  );

  // The uploaded records themselves; the form state holds only their ids, which is what the endpoint takes.
  const [files, setFiles] = useState<readonly FileRecord[]>([]);
  // The last file the upload area refused, so it is shown next to the field as well as on the file itself.
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  // Rejects a file whose bytes do not match the image, PDF or document type its name claims. The browser's
  // `accept` filter cannot tell, so a renamed or corrupt file is caught here with a readable message.
  const validateAttachment = useCallback(
    async (file: File): Promise<string | null> => {
      const problem = await inspectAttachment(file);
      return problem ? t(problem.key, { filename: problem.filename }) : null;
    },
    [t],
  );

  // The schema lives in the component so its messages are translated and follow the current language.
  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('serviceDesk.form.titleRequired'))
          .max(255, t('serviceDesk.form.titleTooLong', { max: 255 })),
        description: z
          .string()
          .trim()
          .min(1, t('serviceDesk.form.descriptionRequired'))
          .max(20000, t('serviceDesk.form.descriptionTooLong', { max: 20000 })),
        category: z
          .string()
          .trim()
          .max(64, t('serviceDesk.form.categoryTooLong', { max: 64 })),
        location: z
          .string()
          .trim()
          .max(255, t('serviceDesk.form.locationTooLong', { max: 255 })),
        urgency: z.enum(TICKET_URGENCIES),
        attachmentIds: z.array(z.string()),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      category: '',
      location: '',
      urgency: 'normal' as const,
      attachmentIds: [] as string[],
    },
  });

  const urgencyItems = TICKET_URGENCIES.map((value) => ({
    value,
    label: t(`serviceDesk.urgency.${value}`),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    let created: TicketView;
    onSubmittingChange?.(true);
    try {
      created = await createTicket(api, {
        title: values.title,
        description: values.description,
        category: values.category || null,
        location: values.location || null,
        urgency: values.urgency,
        attachmentIds: values.attachmentIds,
      });
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 401) {
        form.setError('root', { type: 'sessionExpired' });
      } else {
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('serviceDesk.error.forbidden')
              : t('serviceDesk.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: t('serviceDesk.form.created', { id: created.record.id }),
    });
    onSubmitted(created);
  });

  const rootError = form.formState.errors.root;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
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
              <FieldLabel htmlFor={`${formId}-title`}>
                {t('serviceDesk.form.title')}
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
                placeholder={t('serviceDesk.form.titlePlaceholder')}
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
                {t('serviceDesk.form.description')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-description`}
                rows={4}
                aria-required='true'
                aria-invalid={fieldState.invalid}
                placeholder={t('serviceDesk.form.descriptionPlaceholder')}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <div className='grid gap-4 sm:grid-cols-2'>
          <Controller
            control={form.control}
            name='urgency'
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-urgency`}>
                  {t('serviceDesk.form.urgency')}
                </FieldLabel>
                <Select
                  items={urgencyItems}
                  value={field.value}
                  onValueChange={(next: string | null) => {
                    if (next) field.onChange(next);
                  }}
                >
                  <SelectTrigger
                    ref={field.ref}
                    id={`${formId}-urgency`}
                    onBlur={field.onBlur}
                    aria-invalid={fieldState.invalid}
                    className='w-full'
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

          <Controller
            control={form.control}
            name='category'
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-category`}>
                  {t('serviceDesk.form.category')}
                </FieldLabel>
                <Input
                  {...field}
                  id={`${formId}-category`}
                  autoComplete='off'
                  aria-invalid={fieldState.invalid}
                  placeholder={t('serviceDesk.form.categoryPlaceholder')}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </div>

        <Controller
          control={form.control}
          name='location'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-location`}>
                {t('serviceDesk.form.location')}
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-location`}
                autoComplete='off'
                aria-invalid={fieldState.invalid}
                placeholder={t('serviceDesk.form.locationPlaceholder')}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name='attachmentIds'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-attachments`}>
                {t('serviceDesk.form.attachments')}
              </FieldLabel>
              <FileUploadField
                repository={repository}
                value={files}
                onChange={(next) => {
                  setFiles(next);
                  field.onChange(next.map((record) => record.id));
                }}
                onStatusChange={(status: FileUploadStatus) =>
                  onUploadingChange?.(status === 'uploading')
                }
                validate={validateAttachment}
                onError={(error) => {
                  setAttachmentError(error.message);
                  toaster.show({
                    type: 'error',
                    title: t('serviceDesk.form.uploadFailedTitle'),
                    description: error.message,
                  });
                }}
                multiple
                maxFiles={MAX_ATTACHMENTS}
                maxSize={MAX_ATTACHMENT_BYTES}
                accept={ACCEPTED_FILES}
                disabled={form.formState.isSubmitting}
                labels={{
                  choose: t('serviceDesk.form.chooseFiles'),
                  empty: t('serviceDesk.form.noFiles'),
                  preview: t('serviceDesk.form.previewFile'),
                  download: t('serviceDesk.form.downloadFile'),
                  remove: t('serviceDesk.form.removeFile'),
                  retry: t('serviceDesk.form.retryFile'),
                }}
              />
              <FieldDescription>
                {t('serviceDesk.form.attachmentsHint', {
                  count: MAX_ATTACHMENTS,
                  size: MAX_ATTACHMENT_BYTES / (1024 * 1024),
                })}
              </FieldDescription>
              {attachmentError ? (
                <Alert variant='destructive'>
                  <AlertCircleIcon />
                  <AlertDescription>{attachmentError}</AlertDescription>
                  <AlertAction>
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      aria-label={t('actions.close')}
                      onClick={() => setAttachmentError(null)}
                    >
                      <X aria-hidden='true' />
                    </Button>
                  </AlertAction>
                </Alert>
              ) : null}
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
