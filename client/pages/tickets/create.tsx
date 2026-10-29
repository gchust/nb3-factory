import { useApiClient, useService, useToaster } from '@nocobase/app-client';
import type { ClientFileRepositoryManager } from '@nocobase/app-plugin-file/client';
import { type ReactElement, useState } from 'react';
import { useNavigate } from 'react-router';

import { PageContainer } from '#components/page-container';
import { RouteChildPage } from '#components/route-child-page';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Textarea } from '#components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  FileUploadField,
  clientFileRepositoryManagerToken,
  type FileRecord,
} from '#extensions/nocobase-file-component-ui/index';
import { Alert, AlertDescription } from '#components/ui/alert';

import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  errorText,
  useTicketLabels,
  type Ticket,
  type TicketCategory,
  type TicketPriority,
} from './shared.js';

export default function CreateTicketPage(): ReactElement {
  const { t, category, priority } = useTicketLabels();
  const api = useApiClient();
  const toaster = useToaster();
  const navigate = useNavigate();
  const manager = useService<ClientFileRepositoryManager>(
    clientFileRepositoryManagerToken,
  );
  const files = manager.repository('ticketFiles');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ticketCategory, setTicketCategory] =
    useState<TicketCategory>('account');
  const [ticketPriority, setTicketPriority] =
    useState<TicketPriority>('normal');
  const [attachments, setAttachments] = useState<readonly FileRecord[]>([]);
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const body = await api.request<{ data: Ticket }>({
        path: 'tickets',
        method: 'POST',
        json: {
          title: title.trim(),
          description: description.trim(),
          category: ticketCategory,
          priority: ticketPriority,
          ...(attachments.length
            ? { attachmentIds: attachments.map((file) => file.id) }
            : {}),
        },
      });
      toaster.show({ type: 'success', title: t('helpdesk.create.created') });
      void navigate(`/tickets/${body.data.id}`);
    } catch (next) {
      setError(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <RouteChildPage>
      <PageContainer className='mx-auto max-w-3xl'>
        <PageHeader
          title={t('helpdesk.newTicket')}
          description={t('helpdesk.create.description')}
        />
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {t('helpdesk.create.failed')}
              <span className='block text-xs opacity-80'>
                {errorText(error, '')}
              </span>
            </AlertDescription>
          </Alert>
        ) : null}
        <form
          className='space-y-5'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className='space-y-2'>
            <Label htmlFor='ticket-title'>{t('helpdesk.fields.title')}</Label>
            <Input
              id='ticket-title'
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('helpdesk.create.titlePlaceholder')}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='ticket-description'>
              {t('helpdesk.fields.description')}
            </Label>
            <Textarea
              id='ticket-description'
              required
              rows={6}
              maxLength={20_000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('helpdesk.create.descriptionPlaceholder')}
            />
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label>{t('helpdesk.fields.category')}</Label>
              <Select
                value={ticketCategory}
                onValueChange={(value) => value && setTicketCategory(value)}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {category(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label>{t('helpdesk.fields.priority')}</Label>
              <Select
                value={ticketPriority}
                onValueChange={(value) => value && setTicketPriority(value)}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {priority(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className='space-y-2'>
            <Label>{t('helpdesk.fields.attachments')}</Label>
            <FileUploadField
              repository={files}
              value={attachments}
              onChange={setAttachments}
              multiple
              maxFiles={5}
              maxSize={10 * 1024 * 1024}
              labels={{
                choose: t('helpdesk.attachments.choose'),
                empty: t('helpdesk.attachments.empty'),
                remove: t('helpdesk.attachments.remove'),
                retry: t('helpdesk.retry'),
              }}
              onStatusChange={setUploadStatus}
              onError={setError}
            />
            <p className='text-xs text-muted-foreground'>
              {t('helpdesk.create.attachmentHint')}
            </p>
          </div>
          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => void navigate('/tickets')}
            >
              {t('helpdesk.cancel')}
            </Button>
            <Button
              type='submit'
              disabled={
                busy ||
                uploadStatus === 'uploading' ||
                title.trim().length === 0 ||
                description.trim().length === 0
              }
            >
              {busy
                ? t('helpdesk.create.submitting')
                : t('helpdesk.create.submit')}
            </Button>
          </div>
        </form>
      </PageContainer>
    </RouteChildPage>
  );
}
