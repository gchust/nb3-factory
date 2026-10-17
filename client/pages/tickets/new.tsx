import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PaperclipIcon, UploadIcon, XIcon } from 'lucide-react';
import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
} from 'react';
import { useNavigate } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { StatusBadge } from '#components/status-badge';
import { useRouteOverlay } from '#components/use-route-overlay';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Spinner } from '#components/ui/spinner';
import { Textarea } from '#components/ui/textarea';

import type {
  ServiceDeskTicket,
  TicketPriority,
  UploadedAttachment,
} from './types.js';
import {
  formatBytes,
  priorityTone,
  requestErrorMessage,
} from './ticket-format.js';

const PRIORITIES: readonly TicketPriority[] = [
  'low',
  'normal',
  'high',
  'urgent',
];
const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** Rendered inside the overlay, so the close action can come from its context. */
function NewTicketFooter({
  submitting,
  uploading,
}: {
  readonly submitting: boolean;
  readonly uploading: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <>
      <Button
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('serviceDesk.actions.cancel', { defaultValue: 'Cancel' })}
      </Button>
      <Button
        type='submit'
        form='service-desk-new-ticket'
        disabled={submitting || uploading || isClosing}
      >
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {t('serviceDesk.new.submit', { defaultValue: 'Create ticket' })}
      </Button>
    </>
  );
}

export default function NewTicketPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [attachments, setAttachments] = useState<readonly UploadedAttachment[]>(
    [],
  );
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const notifyError = (cause: unknown): void => {
    const message = requestErrorMessage(cause, t);
    setError(message);
    void toaster.show({ type: 'error', title: message });
  };

  const addFiles = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    const room = MAX_FILES - attachments.length;
    if (room <= 0) {
      void toaster.show({
        type: 'error',
        title: t('serviceDesk.new.tooManyFiles', {
          defaultValue: 'You can attach up to {{count}} files.',
          count: MAX_FILES,
        }),
      });
      return;
    }

    const selected = files.slice(0, room);
    const oversized = selected.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) {
      void toaster.show({
        type: 'error',
        title: t('serviceDesk.new.fileTooLarge', {
          defaultValue: '{{name}} is larger than 5 MB.',
          name: oversized.name,
        }),
      });
      return;
    }

    setUploading(true);
    setError(undefined);
    try {
      for (const file of selected) {
        const body = new FormData();
        body.append('file', file);
        const { data } = await api.request<{ data: UploadedAttachment }>({
          path: 'service-desk/files',
          method: 'POST',
          body,
        });
        setAttachments((current) => [...current, data]);
      }
    } catch (cause) {
      notifyError(cause);
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting || uploading) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const { data } = await api.request<{ data: ServiceDeskTicket }>({
        path: 'service-desk/tickets',
        method: 'POST',
        json: {
          title: title.trim(),
          description: description.trim(),
          priority,
          attachmentIds: attachments.map((attachment) => attachment.id),
        },
      });
      void toaster.show({
        type: 'success',
        title: t('serviceDesk.new.created', {
          defaultValue: 'Ticket #{{id}} created.',
          id: data.id,
        }),
      });
      void navigate(`/tickets/${data.id}`, { replace: true });
    } catch (cause) {
      notifyError(cause);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RouteDialog
      title={t('serviceDesk.new.title', { defaultValue: 'New ticket' })}
      description={t('serviceDesk.new.description', {
        defaultValue:
          'Describe what you need. Your team can follow up in the ticket.',
      })}
      footer={<NewTicketFooter submitting={submitting} uploading={uploading} />}
    >
      <form
        id='service-desk-new-ticket'
        onSubmit={(event) => void onSubmit(event)}
        className='flex flex-col gap-5'
      >
        {error ? (
          <p
            role='alert'
            className='rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive'
          >
            {error}
          </p>
        ) : null}

        <div className='grid gap-2'>
          <Label htmlFor='service-desk-title'>
            {t('serviceDesk.ticket.titleLabel', { defaultValue: 'Title' })}
          </Label>
          <Input
            id='service-desk-title'
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
            required
            autoFocus
            placeholder={t('serviceDesk.new.titlePlaceholder', {
              defaultValue: 'A short summary of the request',
            })}
          />
        </div>

        <div className='grid gap-2'>
          <Label htmlFor='service-desk-description'>
            {t('serviceDesk.ticket.descriptionLabel', {
              defaultValue: 'Description',
            })}
          </Label>
          <Textarea
            id='service-desk-description'
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
            rows={6}
            maxLength={10_000}
            placeholder={t('serviceDesk.new.descriptionPlaceholder', {
              defaultValue:
                'What happened, what you have tried, and what would help.',
            })}
          />
        </div>

        <div className='grid gap-2'>
          <Label htmlFor='service-desk-priority'>
            {t('serviceDesk.ticket.priority', { defaultValue: 'Priority' })}
          </Label>
          <Select
            items={PRIORITIES.map((value) => ({
              value,
              label: t(`serviceDesk.priority.${value}`),
            }))}
            value={priority}
            onValueChange={(next: string | null) => {
              if (next) setPriority(next as TicketPriority);
            }}
          >
            <SelectTrigger
              id='service-desk-priority'
              className='w-full'
              aria-label={t('serviceDesk.ticket.priority', {
                defaultValue: 'Priority',
              })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`serviceDesk.priority.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className='flex gap-2'>
            <StatusBadge tone={priorityTone(priority)}>
              {t(`serviceDesk.priority.${priority}`)}
            </StatusBadge>
          </div>
        </div>

        <div className='grid gap-2'>
          <div className='flex items-center justify-between gap-3'>
            <Label>
              {t('serviceDesk.ticket.attachments', {
                defaultValue: 'Attachments',
              })}
            </Label>
            <span className='text-xs text-muted-foreground'>
              {t('serviceDesk.new.fileHint', {
                defaultValue: 'Up to {{count}} files, 5 MB each',
                count: MAX_FILES,
              })}
            </span>
          </div>
          <input
            ref={inputRef}
            type='file'
            multiple
            className='sr-only'
            onChange={(event) => void addFiles(event)}
          />
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='w-fit'
            disabled={uploading || attachments.length >= MAX_FILES}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Spinner data-icon='inline-start' />
            ) : (
              <UploadIcon data-icon='inline-start' />
            )}
            {t('serviceDesk.new.chooseFiles', {
              defaultValue: 'Choose files',
            })}
          </Button>
          {attachments.length > 0 ? (
            <ul className='flex flex-col gap-2'>
              {attachments.map((attachment) => (
                <li
                  key={attachment.id}
                  className='flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2'
                >
                  <PaperclipIcon className='size-3.5 shrink-0 text-muted-foreground' />
                  <span className='min-w-0 flex-1 truncate text-sm'>
                    {attachment.filename}
                  </span>
                  <span className='shrink-0 text-xs text-muted-foreground'>
                    {formatBytes(attachment.size)}
                  </span>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-xs'
                    aria-label={t('serviceDesk.actions.remove', {
                      defaultValue: 'Remove',
                    })}
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((item) => item.id !== attachment.id),
                      )
                    }
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </form>
    </RouteDialog>
  );
}
