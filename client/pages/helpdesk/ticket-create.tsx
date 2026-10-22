import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { ArrowLeftIcon, SendIcon } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { BackButton } from '#components/back-button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
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
import { Textarea } from '#components/ui/textarea';
import { HelpdeskError } from './shared.js';
import type {
  TicketCategory,
  TicketDetailData,
  TicketPriority,
} from './types.js';

const CATEGORIES: readonly TicketCategory[] = [
  'hardware',
  'software',
  'network',
  'access',
  'other',
];
const PRIORITIES: readonly TicketPriority[] = [
  'low',
  'medium',
  'high',
  'urgent',
];

export default function TicketCreatePage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const location = useLocation();
  const navigate = useNavigate();
  const canCreate = useCan({
    resource: { type: 'composite', id: 'helpdesk.tickets' },
    action: 'create',
  });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TicketCategory>('hardware');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const close = () => {
    void navigate(
      { pathname: '..', search: location.search },
      { replace: true },
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!title.trim() || !description.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await api.request<{ data: TicketDetailData }>({
        path: 'helpdesk/tickets',
        method: 'POST',
        json: {
          title: title.trim(),
          description: description.trim(),
          category,
          priority,
        },
      });
      toaster.show({
        type: 'success',
        title: t('helpdesk.tickets.created'),
      });
      await navigate(
        {
          pathname: `../${encodeURIComponent(result.data.ticket.id)}`,
          search: location.search,
        },
        { replace: true },
      );
    } catch (next) {
      setError(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton to={{ pathname: '..', search: location.search }}>
          {t('helpdesk.tickets.backToList')}
        </BackButton>
        <PageHeader
          title={t('helpdesk.tickets.create')}
          description={t('helpdesk.tickets.createDescription')}
        />
        {!canCreate.can ? (
          <div className='rounded-lg border border-dashed p-6 text-sm text-muted-foreground'>
            {t('helpdesk.tickets.noCreatePermission')}
          </div>
        ) : (
          <form
            className='flex max-w-2xl flex-col gap-5'
            onSubmit={(event) => void submit(event)}
            noValidate
          >
            <div className='flex flex-col gap-2'>
              <Label htmlFor='ticket-title'>
                {t('helpdesk.fields.title')} *
              </Label>
              <Input
                id='ticket-title'
                required
                maxLength={200}
                value={title}
                aria-invalid={submitted && !title.trim()}
                onChange={(event) => setTitle(event.target.value)}
              />
              {submitted && !title.trim() && (
                <p className='text-xs text-destructive'>
                  {t('helpdesk.errors.required')}
                </p>
              )}
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='ticket-description'>
                {t('helpdesk.fields.description')} *
              </Label>
              <Textarea
                id='ticket-description'
                required
                rows={7}
                maxLength={20000}
                value={description}
                aria-invalid={submitted && !description.trim()}
                onChange={(event) => setDescription(event.target.value)}
              />
              {submitted && !description.trim() && (
                <p className='text-xs text-destructive'>
                  {t('helpdesk.errors.required')}
                </p>
              )}
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='flex flex-col gap-2'>
                <Label>{t('helpdesk.fields.category')}</Label>
                <Select
                  value={category}
                  onValueChange={(value) =>
                    setCategory(String(value) as TicketCategory)
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`helpdesk.category.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='flex flex-col gap-2'>
                <Label>{t('helpdesk.fields.priority')}</Label>
                <Select
                  value={priority}
                  onValueChange={(value) =>
                    setPriority(String(value) as TicketPriority)
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`helpdesk.priority.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <HelpdeskError error={error} />
            <div className='flex flex-wrap justify-end gap-2 border-t pt-4'>
              <Button type='button' variant='outline' onClick={close}>
                <ArrowLeftIcon data-icon='inline-start' />
                {t('helpdesk.actions.cancel')}
              </Button>
              <Button type='submit' disabled={busy}>
                <SendIcon data-icon='inline-start' />
                {t(
                  busy
                    ? 'helpdesk.tickets.submitting'
                    : 'helpdesk.tickets.submit',
                )}
              </Button>
            </div>
          </form>
        )}
      </PageContainer>
    </RouteChildPage>
  );
}
