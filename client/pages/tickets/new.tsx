import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PaperclipIcon } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactElement } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { BackButton } from '#components/back-button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { Alert, AlertDescription } from '#components/ui/alert';
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

import { TicketsClient } from './api.js';
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type TicketCategory,
  type TicketPriority,
} from './types.js';

export default function NewTicketPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const navigate = useNavigate();
  const location = useLocation();
  const client = useMemo(() => new TicketsClient(api), [api]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TicketCategory>('incident');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [screenshot, setScreenshot] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const ticket = await client.create({
        title,
        description,
        category,
        priority,
      });
      if (screenshot) {
        try {
          await client.upload(ticket.id, screenshot);
        } catch {
          toaster.show({
            type: 'error',
            title: t('tickets.uploadFailed'),
          });
        }
      }
      await navigate(
        {
          pathname: `../${encodeURIComponent(ticket.id)}`,
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
      <PageContainer className='mx-auto max-w-3xl'>
        <BackButton />
        <PageHeader
          title={t('tickets.new')}
          description={t('tickets.newDescription')}
        />
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {error instanceof ApiClientError && error.status === 403
                ? t('tickets.denied')
                : t('tickets.saveFailed')}
            </AlertDescription>
          </Alert>
        ) : null}
        <form
          className='flex flex-col gap-5'
          onSubmit={(event) => void submit(event)}
        >
          <div className='flex flex-col gap-2'>
            <Label htmlFor='ticket-title'>{t('tickets.fields.title')} *</Label>
            <Input
              id='ticket-title'
              required
              maxLength={200}
              placeholder={t('tickets.fields.titlePlaceholder')}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='ticket-description'>
              {t('tickets.fields.description')} *
            </Label>
            <Textarea
              id='ticket-description'
              required
              rows={8}
              maxLength={20000}
              placeholder={t('tickets.fields.descriptionPlaceholder')}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='flex flex-col gap-2'>
              <Label>{t('tickets.fields.category')}</Label>
              <Select
                items={TICKET_CATEGORIES.map((value) => ({
                  value,
                  label: t(`tickets.category.${value}`),
                }))}
                value={category}
                onValueChange={(value) =>
                  setCategory(String(value) as TicketCategory)
                }
              >
                <SelectTrigger aria-label={t('tickets.fields.category')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`tickets.category.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='flex flex-col gap-2'>
              <Label>{t('tickets.fields.priority')}</Label>
              <Select
                items={TICKET_PRIORITIES.map((value) => ({
                  value,
                  label: t(`tickets.priority.${value}`),
                }))}
                value={priority}
                onValueChange={(value) =>
                  setPriority(String(value) as TicketPriority)
                }
              >
                <SelectTrigger aria-label={t('tickets.fields.priority')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`tickets.priority.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='ticket-screenshot'>
              {t('tickets.fields.screenshot')}
            </Label>
            <label className='flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground'>
              <PaperclipIcon className='size-4' aria-hidden />
              <span>{screenshot?.name ?? t('tickets.attachScreenshot')}</span>
              <input
                id='ticket-screenshot'
                type='file'
                accept='image/*'
                className='sr-only'
                onChange={(event) => {
                  setScreenshot(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
            <p className='text-xs text-muted-foreground'>
              {t('tickets.fields.screenshotHint')}
            </p>
            {screenshot ? (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='self-start'
                onClick={() => setScreenshot(undefined)}
              >
                {t('tickets.removeScreenshot')}
              </Button>
            ) : null}
          </div>
          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={() => void navigate(-1)}
            >
              {t('tickets.cancel')}
            </Button>
            <Button
              type='submit'
              disabled={busy || !title.trim() || !description.trim()}
            >
              {t(busy ? 'tickets.creating' : 'tickets.create')}
            </Button>
          </div>
        </form>
      </PageContainer>
    </RouteChildPage>
  );
}
