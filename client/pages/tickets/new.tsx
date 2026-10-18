import {
  ApiClientError,
  useApiClient,
  useService,
  useToaster,
} from '@nocobase/app-client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';

import { FileUploadField } from '#extensions/nocobase-file-component-ui/components/file-upload-field';
import type { FileRecord } from '#extensions/nocobase-file-component-ui/types';
import { RouteDialog } from '#components/route-dialog';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
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

import { createTicket } from './api.js';
import type { TicketsOutletContext } from './types.js';

const FORM_ID = 'it-ticket-new-form';

export default function NewTicketPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  return (
    <RouteDialog
      title={t('tickets.create.title')}
      description={t('tickets.create.description')}
      className='sm:max-w-2xl'
      beforeClose={() => !submittingRef.current}
      footer={<NewTicketFooter submitting={submitting} />}
    >
      <NewTicketBody
        onSubmittingChange={(value) => {
          submittingRef.current = value;
          setSubmitting(value);
        }}
      />
    </RouteDialog>
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
  const navigate = useNavigate();
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<TicketsOutletContext>();
  const fileManager = useService(clientFileRepositoryManagerToken);
  const repository = fileManager.repository('itTicketFiles');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState('normal');
  const [files, setFiles] = useState<readonly FileRecord[]>([]);
  const [error, setError] = useState<string>();

  const urgencyItems = (['normal', 'urgent', 'critical'] as const).map(
    (value) => ({ value, label: t(`tickets.urgency.${value}`) }),
  );

  const submit = async (): Promise<void> => {
    if (!title.trim() || !description.trim()) {
      setError(t('tickets.create.required'));
      return;
    }
    onSubmittingChange(true);
    setError(undefined);
    try {
      const ticket = await createTicket(api, {
        title: title.trim(),
        description: description.trim(),
        urgency,
        attachmentIds: files.map((file) => file.id),
      });
      toaster.show({
        type: 'success',
        title: t('tickets.create.success', { id: ticket.id }),
      });
      reload();
      void navigate(`/tickets/${ticket.id}`, { replace: true });
      void close();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : t('tickets.create.failed'),
      );
    } finally {
      onSubmittingChange(false);
    }
  };

  return (
    <form
      id={FORM_ID}
      noValidate
      className='flex flex-col gap-5'
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className='flex flex-col gap-2'>
        <Label htmlFor={`${FORM_ID}-title`}>
          {t('tickets.field.title')}
          <span aria-hidden='true' className='text-destructive'>
            *
          </span>
        </Label>
        <Input
          id={`${FORM_ID}-title`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          autoComplete='off'
          required
        />
      </div>

      <div className='flex flex-col gap-2'>
        <Label htmlFor={`${FORM_ID}-description`}>
          {t('tickets.field.description')}
          <span aria-hidden='true' className='text-destructive'>
            *
          </span>
        </Label>
        <Textarea
          id={`${FORM_ID}-description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={5}
          required
        />
      </div>

      <div className='flex flex-col gap-2'>
        <Label>{t('tickets.field.urgency')}</Label>
        <Select
          items={urgencyItems}
          value={urgency}
          onValueChange={(value) => setUrgency(String(value))}
        >
          <SelectTrigger aria-label={t('tickets.field.urgency')}>
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
      </div>

      <div className='flex flex-col gap-2'>
        <Label>{t('tickets.field.screenshots')}</Label>
        <FileUploadField
          repository={repository}
          value={files}
          onChange={setFiles}
          onError={(caught) => setError(caught.message)}
          multiple
          maxFiles={10}
          maxSize={10 * 1024 * 1024}
          accept={['image/*']}
          labels={{
            choose: t('tickets.field.chooseScreenshots'),
            empty: t('tickets.field.noScreenshots'),
          }}
        />
        <p className='text-xs text-muted-foreground'>
          {t('tickets.field.screenshotsHint')}
        </p>
      </div>
    </form>
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
        {submitting ? t('tickets.create.submitting') : t('tickets.report')}
      </Button>
    </>
  );
}
