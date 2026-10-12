import { ApiClientError, useApiClient, useService } from '@nocobase/app-client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import { FileUploadField } from '#extensions/nocobase-file-component-ui/components/file-upload-field';
import type { FileRecord } from '#extensions/nocobase-file-component-ui/types';
import { AlertCircleIcon } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactElement } from 'react';
import { useOutletContext } from 'react-router';

import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Textarea } from '#components/ui/textarea';

import {
  TICKET_PRIORITIES,
  type Ticket,
  type TicketPriority,
  type TicketsOutletContext,
} from './types.js';
import { isDecodableImage } from './attachments.js';

export default function NewTicketPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog
      title={t('helpdesk.form.create.title')}
      description={t('helpdesk.form.create.description')}
    >
      <NewTicketForm />
    </RouteDialog>
  );
}

function NewTicketForm(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const manager = useService(clientFileRepositoryManagerToken);
  const { reload } = useOutletContext<TicketsOutletContext>();
  const { close } = useRouteOverlay();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [screenshots, setScreenshots] = useState<readonly FileRecord[]>([]);
  const [attachmentError, setAttachmentError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>();

  const priorityItems = useMemo(
    () =>
      TICKET_PRIORITIES.map((value) => ({
        value,
        label: t(`helpdesk.priority.${value}`),
      })),
    [t],
  );

  const ready = title.trim() !== '' && description.trim() !== '' && !uploading;

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await api.request<{ data: Ticket }>({
        path: 'tickets',
        method: 'POST',
        json: {
          title: title.trim(),
          description: description.trim(),
          category: category.trim() || null,
          priority,
          screenshotIds: screenshots.map((file) => file.id),
        },
      });
      reload();
      await close();
    } catch (cause) {
      setError(cause);
    } finally {
      setSubmitting(false);
    }
  }

  const status = error instanceof ApiClientError ? error.status : undefined;

  return (
    <form
      className='flex flex-col gap-4'
      onSubmit={(event) => void submit(event)}
    >
      <div className='flex flex-col gap-2'>
        <Label htmlFor='ticket-title'>{t('helpdesk.fields.title')}</Label>
        <Input
          id='ticket-title'
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='ticket-description'>
          {t('helpdesk.fields.description')}
        </Label>
        <Textarea
          id='ticket-description'
          required
          rows={5}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='ticket-priority'>
            {t('helpdesk.fields.priority')}
          </Label>
          <Select
            items={priorityItems}
            value={priority}
            onValueChange={(value) => setPriority(value as TicketPriority)}
          >
            <SelectTrigger id='ticket-priority'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_PRIORITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`helpdesk.priority.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='ticket-category'>
            {t('helpdesk.fields.category')}
          </Label>
          <Input
            id='ticket-category'
            placeholder={t('helpdesk.form.categoryPlaceholder')}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </div>
      </div>
      <div className='flex flex-col gap-2'>
        <Label>{t('helpdesk.fields.screenshots')}</Label>
        <FileUploadField
          multiple
          accept={['image/*']}
          repository={manager.repository('ticketAttachments')}
          value={screenshots}
          onChange={(files) => {
            setAttachmentError(undefined);
            setScreenshots(files);
          }}
          onError={(error) => setAttachmentError(error.message)}
          // The browser trusts the extension; look inside the bytes so a mislabeled or damaged file is refused here
          // rather than stored and shown as a submitted screenshot.
          validateFile={async (file) =>
            (await isDecodableImage(file))
              ? null
              : t('helpdesk.form.screenshots.invalidImage')
          }
          onStatusChange={(value) => setUploading(value === 'uploading')}
          labels={{
            choose: t('helpdesk.form.screenshots.choose'),
            remove: t('helpdesk.form.screenshots.remove'),
          }}
        />
        {attachmentError ? (
          <p className='flex items-center gap-2 text-sm text-destructive'>
            <AlertCircleIcon className='size-4' aria-hidden />
            {attachmentError}
          </p>
        ) : null}
        <p className='text-sm text-muted-foreground'>
          {t('helpdesk.form.screenshots.hint')}
        </p>
      </div>
      {error ? (
        <p className='flex items-center gap-2 text-sm text-destructive'>
          <AlertCircleIcon className='size-4' aria-hidden />
          {status === 401
            ? t('helpdesk.form.error.unauthorized')
            : t('helpdesk.form.error.requestFailed')}
        </p>
      ) : null}
      <div className='flex justify-end gap-2'>
        <Button type='button' variant='outline' onClick={() => void close()}>
          {t('actions.cancel')}
        </Button>
        <Button disabled={!ready || submitting} type='submit'>
          {submitting
            ? t('helpdesk.form.submitting')
            : t('helpdesk.form.submit')}
        </Button>
      </div>
    </form>
  );
}
