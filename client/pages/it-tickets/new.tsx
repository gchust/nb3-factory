import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQueryClient } from '@tanstack/react-query';
import { FileImageIcon, PlusIcon, XIcon } from 'lucide-react';
import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
} from 'react';
import { useLocation, useNavigate } from 'react-router';

import { Loading } from '#components/loading';
import { RouteDialog } from '#components/route-dialog';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Textarea } from '#components/ui/textarea';
import { useRouteOverlay } from '#components/use-route-overlay';

import { createTicket, uploadScreenshots } from './api.js';
import { formatBytes, urgencyLabel } from './labels.js';
import {
  inspectScreenshot,
  SCREENSHOT_ACCEPT,
} from './screenshot-validation.js';
import {
  TICKET_URGENCIES,
  type TicketUrgency,
  type UploadedFile,
} from './types.js';

const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const FORM_ID = 'it-ticket-create-form';

export default function NewTicketPage(): ReactElement {
  const { t } = useTranslation();
  const access = useCan({
    resource: { type: 'composite', id: 'it.tickets' },
    action: 'create',
  });

  if (access.isPending) {
    return (
      <RouteDialog title={t('itTickets.create.title')}>
        <Loading />
      </RouteDialog>
    );
  }

  if (access.error || !access.can) {
    return (
      <RouteDialog title={t('itTickets.create.title')} footer={<CloseFooter />}>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <FileImageIcon />
            </EmptyMedia>
            <EmptyTitle>{t('itTickets.create.notAllowedTitle')}</EmptyTitle>
            <EmptyDescription>
              {access.error
                ? t('itTickets.errors.permissionCheckFailed')
                : t('itTickets.create.notAllowedDescription')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </RouteDialog>
    );
  }

  return <CreateTicketDialog />;
}

function CreateTicketDialog(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const changeSubmitting = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };
  return (
    <RouteDialog
      title={t('itTickets.create.title')}
      description={t('itTickets.create.description')}
      beforeClose={() => !submittingRef.current}
      footer={<DialogFooter submitting={submitting} />}
    >
      <CreateTicketForm onSubmittingChange={changeSubmitting} />
    </RouteDialog>
  );
}

function CloseFooter(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <Button variant='outline' onClick={() => void close()}>
      {t('actions.close')}
    </Button>
  );
}

function DialogFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting
          ? t('itTickets.create.submitting')
          : t('itTickets.create.submit')}
      </Button>
    </>
  );
}

function CreateTicketForm({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const toaster = useToaster();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<TicketUrgency>('medium');
  const [files, setFiles] = useState<readonly File[]>([]);
  const filesRef = useRef<readonly File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    readonly title?: string;
    readonly description?: string;
    readonly files?: string;
  }>({});
  const [error, setError] = useState<unknown>();
  const uploadedRef = useRef<
    | {
        readonly signature: string;
        readonly records: readonly UploadedFile[];
      }
    | undefined
  >(undefined);

  async function changeFiles(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!selected.length) return;
    const tooLarge = selected.find((file) => file.size > MAX_FILE_SIZE);
    if (tooLarge) {
      setFieldErrors((current) => ({
        ...current,
        files: t('itTickets.create.fileTooLarge', {
          name: tooLarge.name,
          size: formatBytes(MAX_FILE_SIZE),
        }),
      }));
      return;
    }
    if (filesRef.current.length + selected.length > MAX_FILES) {
      setFieldErrors((current) => ({
        ...current,
        files: t('itTickets.create.tooManyFiles', { count: MAX_FILES }),
      }));
      return;
    }

    // A picker's `accept` list filters the dialog but does not validate what it
    // returns, so a renamed executable or damaged image reaches this point.
    // Check every choice before changing the list, and keep the previous valid
    // selection when one of them cannot be used.
    for (const file of selected) {
      const problem = await inspectScreenshot(file);
      if (problem) {
        setFieldErrors((current) => ({
          ...current,
          files: t(
            problem === 'type'
              ? 'itTickets.create.unsupportedFile'
              : 'itTickets.create.corruptFile',
            { name: file.name },
          ),
        }));
        return;
      }
    }

    const next = [...filesRef.current, ...selected];
    filesRef.current = next;
    setFiles(next);
    uploadedRef.current = undefined;
    setFieldErrors((current) => ({ ...current, files: undefined }));
  }

  function removeFile(index: number): void {
    const next = filesRef.current.filter((_, position) => position !== index);
    filesRef.current = next;
    setFiles(next);
    uploadedRef.current = undefined;
    setFieldErrors((current) => ({ ...current, files: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors: {
      title?: string;
      description?: string;
      files?: string;
    } = {};
    if (!title.trim()) nextErrors.title = t('itTickets.create.titleRequired');
    else if (title.trim().length > 120) {
      nextErrors.title = t('itTickets.create.titleTooLong');
    }
    if (!description.trim()) {
      nextErrors.description = t('itTickets.create.descriptionRequired');
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    setError(undefined);
    onSubmittingChange(true);
    try {
      let uploaded = uploadedRef.current;
      const signature = files
        .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
        .join('|');
      if (files.length > 0 && uploaded?.signature !== signature) {
        uploaded = {
          signature,
          records: await uploadScreenshots(api, files),
        };
        uploadedRef.current = uploaded;
      }

      const result = await createTicket(api, {
        title: title.trim(),
        description: description.trim(),
        urgency,
        fileIds: uploaded?.records.map((record) => record.id) ?? [],
      });
      await queryClient.invalidateQueries({ queryKey: ['it-tickets'] });
      void toaster.show({
        type: 'success',
        title: t('itTickets.create.created'),
      });
      await navigate(
        {
          pathname: `/it-tickets/${result.data.id}`,
          search: location.search,
        },
        { replace: true },
      );
    } catch (cause) {
      setError(cause);
      void toaster.show({
        type: 'error',
        title:
          cause instanceof ApiClientError && cause.status === 403
            ? t('itTickets.errors.forbidden')
            : t('itTickets.create.failed'),
      });
    } finally {
      onSubmittingChange(false);
    }
  }

  const errorStatus =
    error instanceof ApiClientError ? error.status : undefined;

  return (
    <form id={FORM_ID} onSubmit={(event) => void submit(event)}>
      <FieldGroup>
        {errorStatus === 401 ? (
          <SessionExpiredAlert />
        ) : error ? (
          <p role='alert' className='text-sm text-destructive'>
            {errorStatus === 403
              ? t('itTickets.errors.forbidden')
              : t('itTickets.create.failed')}
          </p>
        ) : null}
        <Field data-invalid={Boolean(fieldErrors.title)}>
          <FieldLabel htmlFor='it-ticket-title'>
            {t('itTickets.fields.title')}
          </FieldLabel>
          <Input
            id='it-ticket-title'
            value={title}
            maxLength={120}
            placeholder={t('itTickets.create.titlePlaceholder')}
            aria-invalid={Boolean(fieldErrors.title)}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
          />
          <FieldDescription>
            {t('itTickets.create.titleHint', { count: title.length })}
          </FieldDescription>
          {fieldErrors.title ? (
            <FieldError>{fieldErrors.title}</FieldError>
          ) : null}
        </Field>
        <Field data-invalid={Boolean(fieldErrors.description)}>
          <FieldLabel htmlFor='it-ticket-description'>
            {t('itTickets.fields.description')}
          </FieldLabel>
          <Textarea
            id='it-ticket-description'
            value={description}
            rows={7}
            maxLength={20000}
            placeholder={t('itTickets.create.descriptionPlaceholder')}
            aria-invalid={Boolean(fieldErrors.description)}
            onChange={(event) => setDescription(event.target.value)}
          />
          <FieldDescription>
            {t('itTickets.create.descriptionHint')}
          </FieldDescription>
          {fieldErrors.description ? (
            <FieldError>{fieldErrors.description}</FieldError>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor='it-ticket-urgency'>
            {t('itTickets.fields.urgency')}
          </FieldLabel>
          <Select
            value={urgency}
            onValueChange={(next: string | null) => {
              if (next) setUrgency(next as TicketUrgency);
            }}
          >
            <SelectTrigger id='it-ticket-urgency' className='w-48'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_URGENCIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {urgencyLabel(t, value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            {t('itTickets.create.urgencyHint')}
          </FieldDescription>
        </Field>
        <Field data-invalid={Boolean(fieldErrors.files)}>
          <FieldLabel htmlFor='it-ticket-files'>
            {t('itTickets.fields.screenshots')}
          </FieldLabel>
          <Input
            ref={fileInputRef}
            id='it-ticket-files'
            type='file'
            accept={SCREENSHOT_ACCEPT}
            multiple
            className='sr-only'
            aria-invalid={Boolean(fieldErrors.files)}
            onChange={(event) => void changeFiles(event)}
          />
          <div>
            <Button
              type='button'
              variant='outline'
              onClick={() => fileInputRef.current?.click()}
            >
              <PlusIcon data-icon='inline-start' />
              {files.length
                ? t('itTickets.create.addMoreFiles')
                : t('itTickets.create.chooseFiles')}
            </Button>
          </div>
          <FieldDescription>
            {t('itTickets.create.screenshotHint', {
              count: MAX_FILES,
              size: formatBytes(MAX_FILE_SIZE),
            })}
          </FieldDescription>
          {fieldErrors.files ? (
            <FieldError>{fieldErrors.files}</FieldError>
          ) : null}
          {files.length > 0 ? (
            <ul className='flex flex-wrap gap-2'>
              {files.map((file, index) => (
                <li
                  key={`${file.name}:${file.size}:${file.lastModified}`}
                  className='flex max-w-full items-center gap-1 rounded-lg border bg-muted/30 py-1 pr-1 pl-2 text-sm'
                >
                  <FileImageIcon
                    className='size-4 shrink-0 text-muted-foreground'
                    aria-hidden
                  />
                  <span className='truncate'>{file.name}</span>
                  <span className='shrink-0 text-xs text-muted-foreground'>
                    {formatBytes(file.size)}
                  </span>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-xs'
                    aria-label={t('itTickets.create.removeFile', {
                      name: file.name,
                    })}
                    onClick={() => removeFile(index)}
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className='flex items-center gap-1.5 text-sm text-muted-foreground'>
              <PlusIcon className='size-4' aria-hidden />
              {t('itTickets.create.noFiles')}
            </p>
          )}
        </Field>
      </FieldGroup>
    </form>
  );
}
