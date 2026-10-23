import { RouteDialog } from '#components/route-dialog';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Field, FieldDescription, FieldLabel } from '#components/ui/field';
import { Input } from '#components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Textarea } from '#components/ui/textarea';
import {
  clientFileRepositoryManagerToken,
  FileUploadField,
  type FileRecord,
} from '#extensions/nocobase-file-component-ui';
import { useService } from '@nocobase/app-client';
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import {
  TICKET_CATEGORIES,
  TICKET_URGENCIES,
  errorMessage,
  type DataBody,
  type TicketDetail,
  type TicketUrgency,
} from './api.js';
import { useTicketLabels } from './hooks.js';

/** The largest screenshot the upload endpoint accepts, so the client refuses it before sending. */
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

/**
 * Reports a repair request.
 *
 * The screenshot is uploaded before the ticket exists, through the file repository's own endpoint, and the ticket then
 * names it by id. That order matters: a reporter describes the problem while the file is already stored, so a failed
 * save never leaves an uploaded file without a ticket, and the attachment is readable by the server only through the
 * ticket that names it once it is attached.
 */
export default function NewTicketPage(): ReactElement {
  const { t } = useTranslation();
  const labels = useTicketLabels();
  const api = useApiClient();
  const navigate = useNavigate();
  const files = useService(clientFileRepositoryManagerToken);
  const repository = files.repository('ticketAttachments');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('hardware');
  const [urgency, setUrgency] = useState<TicketUrgency>('normal');
  const [attachments, setAttachments] = useState<readonly FileRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [titleError, setTitleError] = useState<string>();

  const submit = async (): Promise<void> => {
    if (!title.trim()) {
      setTitleError(t('tickets.form.titleRequired'));
      return;
    }
    setTitleError(undefined);
    setBusy(true);
    setError(undefined);
    try {
      const body = await api.request<DataBody<TicketDetail>>({
        path: 'tickets',
        method: 'POST',
        json: {
          title: title.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          category,
          urgency,
          ...(attachments[0] ? { attachmentId: attachments[0].id } : {}),
        },
      });
      void navigate(`/tickets/${body.data.ticket.id}`, { replace: true });
    } catch (next) {
      setError(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <RouteDialog
      title={t('tickets.new')}
      description={t('tickets.newDescription')}
      beforeClose={() => !busy}
      footer={
        <>
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => {
              void navigate('..', { relative: 'path' });
            }}
          >
            {t('tickets.form.cancel')}
          </Button>
          <Button
            disabled={busy || uploading || !title.trim()}
            onClick={() => void submit()}
          >
            {busy ? t('tickets.form.submitting') : t('tickets.form.submit')}
          </Button>
        </>
      }
    >
      <form
        className='flex flex-col gap-4'
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field>
          <FieldLabel htmlFor='ticket-title'>
            {t('tickets.form.title')}
          </FieldLabel>
          <Input
            id='ticket-title'
            value={title}
            maxLength={255}
            aria-invalid={Boolean(titleError)}
            placeholder={t('tickets.form.titlePlaceholder')}
            onChange={(event) => setTitle(event.target.value)}
          />
          {titleError ? (
            <FieldDescription>{titleError}</FieldDescription>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor='ticket-description'>
            {t('tickets.form.issue')}
          </FieldLabel>
          <Textarea
            id='ticket-description'
            value={description}
            rows={5}
            placeholder={t('tickets.form.issuePlaceholder')}
            onChange={(event) => setDescription(event.target.value)}
          />
          <FieldDescription>{t('tickets.form.issueHint')}</FieldDescription>
        </Field>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field>
            <FieldLabel>{t('tickets.form.category')}</FieldLabel>
            <Select
              items={TICKET_CATEGORIES.map((value) => ({
                value,
                label: labels.category(value),
              }))}
              value={category}
              onValueChange={(value) => setCategory(String(value))}
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_CATEGORIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {labels.category(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{t('tickets.form.urgency')}</FieldLabel>
            <Select
              items={TICKET_URGENCIES.map((value) => ({
                value,
                label: labels.urgency(value),
              }))}
              value={urgency}
              onValueChange={(value) => setUrgency(value as TicketUrgency)}
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_URGENCIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {labels.urgency(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field>
          <FieldLabel>{t('tickets.form.screenshot')}</FieldLabel>
          <FileUploadField
            repository={repository}
            value={attachments}
            onChange={(next) => setAttachments(next)}
            onStatusChange={(status) => setUploading(status === 'uploading')}
            onError={(next) => setError(next)}
            accept={['image/*']}
            maxSize={MAX_SCREENSHOT_BYTES}
            labels={{
              choose: t('tickets.form.chooseScreenshot'),
              remove: t('tickets.form.removeScreenshot'),
            }}
          />
          <FieldDescription>
            {t('tickets.form.screenshotHint')}
          </FieldDescription>
        </Field>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {errorMessage(error) ?? t('tickets.error.failed')}
            </AlertDescription>
          </Alert>
        ) : null}
      </form>
    </RouteDialog>
  );
}
