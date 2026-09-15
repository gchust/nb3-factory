import { useTranslation } from '@nocobase/i18n/client';
import { apiClientToken, useService } from '@nocobase/app-client';
import { Plus } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { useNavigate } from 'react-router';

import { PriorityBadge, StatusBadge } from '@/components/support/badges';
import { FileUploadField } from '@/components/support/file-upload-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ATTACHMENT_ACCEPT,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from '@/lib/support-constants';
import {
  createTicket,
  fetchTickets,
  formatDateTime,
  supportErrorKey,
  uploadAttachments,
  validateLocalFile,
  type TicketSummary,
} from '@/lib/support';

export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const navigate = useNavigate();

  const [tickets, setTickets] = useState<readonly TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [files, setFiles] = useState<readonly File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback((): void => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchTickets(api);
        if (cancelled) return;
        setTickets(data);
        setLoadError(null);
      } catch (error) {
        if (!cancelled) setLoadError(supportErrorKey(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, reloadToken]);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!title.trim()) {
      setFormError('support.errors.INVALID_TITLE');
      return;
    }
    for (const file of files) {
      const result = validateLocalFile(file);
      if (!result.ok) {
        setFormError(`support.errors.${result.code}`);
        return;
      }
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const created = await createTicket(api, { title, description, priority });
      let uploadError: string | null = null;
      if (files.length > 0) {
        try {
          await uploadAttachments(api, created.id, files);
        } catch (error) {
          uploadError = supportErrorKey(error);
        }
      }
      setTitle('');
      setDescription('');
      setPriority('medium');
      setFiles([]);
      refresh();
      await navigate(`/tickets/${created.id}`, {
        state: uploadError ? { uploadError } : undefined,
      });
    } catch (error) {
      setFormError(supportErrorKey(error));
    } finally {
      setSubmitting(false);
    }
  };

  const visible =
    statusFilter === 'all'
      ? tickets
      : tickets.filter((ticket) => ticket.status === statusFilter);

  const priorityItems = TICKET_PRIORITIES.map((value) => ({
    value,
    label: t(`support.priority.${value}`),
  }));
  const statusItems = [
    { value: 'all', label: t('support.filters.allStatuses') },
    ...TICKET_STATUSES.map((value) => ({
      value,
      label: t(`support.status.${value}`),
    })),
  ];

  return (
    <section className='mx-auto w-full max-w-6xl space-y-8 px-6 py-8'>
      <header className='space-y-1'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('support.tickets.title')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('support.tickets.description')}
        </p>
      </header>

      <form
        className='space-y-4 rounded-xl border border-border bg-card p-5'
        onSubmit={(event) => void handleSubmit(event)}
      >
        <h2 className='font-heading text-lg font-medium'>
          {t('support.tickets.newTitle')}
        </h2>
        <div className='space-y-2'>
          <Label htmlFor='ticket-title'>{t('support.fields.title')}</Label>
          <Input
            id='ticket-title'
            name='title'
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='ticket-description'>
            {t('support.fields.description')}
          </Label>
          <Textarea
            id='ticket-description'
            name='description'
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='ticket-priority'>
            {t('support.fields.priority')}
          </Label>
          <Select
            items={priorityItems}
            value={priority}
            onValueChange={(value: unknown) => setPriority(String(value))}
          >
            <SelectTrigger
              id='ticket-priority'
              className='w-full'
              aria-label={t('support.fields.priority')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_PRIORITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`support.priority.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-2'>
          <Label htmlFor='ticket-attachments'>
            {t('support.fields.attachments')}
          </Label>
          <FileUploadField
            id='ticket-attachments'
            label={t('support.attachments.choose')}
            accept={ATTACHMENT_ACCEPT}
            multiple
            value={files}
            onChange={setFiles}
            disabled={submitting}
          />
          <p className='text-xs text-muted-foreground'>
            {t('support.attachments.hint')}
          </p>
        </div>
        {formError ? (
          <p className='text-sm text-destructive' role='alert'>
            {t(formError)}
          </p>
        ) : null}
        <Button type='submit' disabled={submitting}>
          <Plus aria-hidden='true' />
          {submitting
            ? t('support.tickets.submitting')
            : t('support.tickets.submit')}
        </Button>
      </form>

      <div className='space-y-3'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <h2 className='font-heading text-lg font-medium'>
            {t('support.tickets.listTitle')}
          </h2>
          <div className='w-56'>
            <Select
              items={statusItems}
              value={statusFilter}
              onValueChange={(value: unknown) => setStatusFilter(String(value))}
            >
              <SelectTrigger
                className='w-full'
                aria-label={t('support.filters.status')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <p className='text-sm text-muted-foreground'>
            {t('support.common.loading')}
          </p>
        ) : loadError ? (
          <p className='text-sm text-destructive' role='alert'>
            {t(loadError)}
          </p>
        ) : visible.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('support.tickets.empty')}
          </p>
        ) : (
          <div className='overflow-x-auto rounded-xl border border-border'>
            <table className='w-full text-sm'>
              <thead className='bg-muted/40 text-left text-xs text-muted-foreground'>
                <tr>
                  <th className='px-3 py-2'>{t('support.fields.number')}</th>
                  <th className='px-3 py-2'>{t('support.fields.title')}</th>
                  <th className='px-3 py-2'>{t('support.fields.status')}</th>
                  <th className='px-3 py-2'>{t('support.fields.priority')}</th>
                  <th className='px-3 py-2'>{t('support.fields.assignee')}</th>
                  <th className='px-3 py-2'>{t('support.fields.createdAt')}</th>
                  <th className='px-3 py-2'>
                    {t('support.fields.attachmentCount')}
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-border'>
                {visible.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className='cursor-pointer hover:bg-muted/40'
                    onClick={() => void navigate(`/tickets/${ticket.id}`)}
                  >
                    <td className='px-3 py-2 font-medium'>
                      <button
                        type='button'
                        className='text-primary underline-offset-4 hover:underline'
                        data-testid={`ticket-link-${ticket.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void navigate(`/tickets/${ticket.id}`);
                        }}
                      >
                        {ticket.number}
                      </button>
                    </td>
                    <td className='px-3 py-2'>{ticket.title}</td>
                    <td className='px-3 py-2'>
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className='px-3 py-2'>
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td className='px-3 py-2 text-muted-foreground'>
                      {ticket.assigneeName ?? t('support.fields.unassigned')}
                    </td>
                    <td className='px-3 py-2 text-muted-foreground'>
                      {formatDateTime(ticket.createdAt)}
                    </td>
                    <td className='px-3 py-2 text-muted-foreground'>
                      {ticket.attachmentCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
