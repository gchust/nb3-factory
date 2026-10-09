import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SelectField,
  StatusBadge,
} from '@/pages/service/shared.js';
import {
  TICKET_STATUSES,
  formatDateTime,
  useActionFeedback,
  useServiceList,
  useServiceMe,
  useServiceObject,
} from '@/pages/service/service-api.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PRIORITIES } from '@/pages/service/service-api.js';
import type { Customer, Device, Ticket } from '@/pages/service/types.js';

interface TicketPage {
  items: Ticket[];
  total: number;
}

interface Draft {
  title: string;
  customerId: string;
  deviceId: string;
  problem: string;
  priority: string;
  dueAt: string;
  confidential: string;
}

const EMPTY: Draft = {
  title: '',
  customerId: '',
  deviceId: '',
  problem: '',
  priority: 'normal',
  dueAt: '',
  confidential: 'false',
};

export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const me = useServiceMe();
  const feedback = useActionFeedback();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const query = useMemo(
    () => ({ status: status || undefined, q: q || undefined, pageSize: 50 }),
    [status, q],
  );
  const queryKey = `${status}|${q}`;
  const {
    data: page,
    error,
    loading,
    reload,
  } = useServiceObject<TicketPage>('service/tickets', query, queryKey);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const devices = useServiceList<Device>('service/devices', undefined, '');
  const customers = useServiceList<Customer>(
    'service/customers',
    undefined,
    '',
  );

  const deviceOptions = [
    { value: '', label: t('service.tickets.selectDevice') },
    ...(devices.data ?? []).map((device) => ({
      value: String(device.id),
      label: `${device.serial} · ${device.name}`,
    })),
  ];

  const customerOptions = [
    { value: '', label: t('service.devices.selectCustomer') },
    ...(customers.data ?? []).map((customer) => ({
      value: String(customer.id),
      label: customer.name,
    })),
  ];

  const save = async (): Promise<void> => {
    if (!draft) return;
    setSaving(true);
    try {
      await api.request({
        path: 'service/tickets',
        method: 'POST',
        json: {
          title: draft.title,
          customerId: draft.customerId ? Number(draft.customerId) : undefined,
          deviceId: draft.deviceId ? Number(draft.deviceId) : undefined,
          problem: draft.problem || undefined,
          priority: draft.priority,
          dueAt: draft.dueAt || undefined,
          confidential: draft.confidential === 'true',
        },
      });
      feedback.success(t('service.tickets.created'));
      setDraft(EMPTY);
      reload();
    } catch (saveError) {
      feedback.failure(saveError);
    } finally {
      setSaving(false);
    }
  };

  const update = (field: keyof Draft, value: string): void =>
    setDraft((current) => (current ? { ...current, [field]: value } : current));

  const statusOptions = [
    { value: '', label: t('service.tickets.allStatuses') },
    ...TICKET_STATUSES.map((value) => ({
      value,
      label: t(`service.status.${value}`),
    })),
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('service.tickets.title')}
        description={t('service.tickets.description')}
        actions={
          <Button variant='outline' onClick={() => setDraft(EMPTY)}>
            <PlusIcon data-icon='inline-start' />
            {t('service.tickets.create')}
          </Button>
        }
      />
      {draft ? (
        <Card>
          <CardContent className='grid gap-4 pt-6 sm:grid-cols-2'>
            <div className='grid gap-2 sm:col-span-2'>
              <Label htmlFor='ticket-title'>
                {t('service.tickets.fieldTitle')}
              </Label>
              <Input
                id='ticket-title'
                value={draft.title}
                onChange={(event) => update('title', event.target.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='ticket-customer'>
                {t('service.devices.customer')}
              </Label>
              <SelectField
                id='ticket-customer'
                value={draft.customerId}
                onValueChange={(value) => update('customerId', value)}
                options={customerOptions}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='ticket-device'>
                {t('service.devices.title')}
              </Label>
              <SelectField
                id='ticket-device'
                value={draft.deviceId}
                onValueChange={(value) => update('deviceId', value)}
                options={deviceOptions}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='ticket-priority'>
                {t('service.tickets.priority')}
              </Label>
              <SelectField
                id='ticket-priority'
                value={draft.priority}
                onValueChange={(value) => update('priority', value)}
                options={PRIORITIES.map((value) => ({
                  value,
                  label: t(`service.priority.${value}`),
                }))}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='ticket-due'>{t('service.tickets.dueAt')}</Label>
              <Input
                id='ticket-due'
                type='datetime-local'
                value={draft.dueAt}
                onChange={(event) => update('dueAt', event.target.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='ticket-confidential'>
                {t('service.tickets.confidential')}
              </Label>
              <SelectField
                id='ticket-confidential'
                value={draft.confidential}
                onValueChange={(value) => update('confidential', value)}
                options={[
                  { value: 'false', label: t('service.common.no') },
                  { value: 'true', label: t('service.common.yes') },
                ]}
              />
            </div>
            <div className='grid gap-2 sm:col-span-2'>
              <Label htmlFor='ticket-problem'>
                {t('service.tickets.problem')}
              </Label>
              <Input
                id='ticket-problem'
                value={draft.problem}
                onChange={(event) => update('problem', event.target.value)}
              />
            </div>
            <div className='flex gap-2 sm:col-span-2'>
              <Button
                disabled={
                  saving ||
                  draft.title.trim() === '' ||
                  draft.customerId === '' ||
                  draft.deviceId === ''
                }
                onClick={() => void save()}
              >
                {t('actions.save')}
              </Button>
              <Button variant='ghost' onClick={() => setDraft(null)}>
                {t('actions.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div className='flex flex-wrap items-end gap-3'>
        <div className='grid gap-2'>
          <Label htmlFor='ticket-filter-status'>
            {t('service.tickets.status')}
          </Label>
          <SelectField
            id='ticket-filter-status'
            value={status}
            onValueChange={setStatus}
            options={statusOptions}
            className='w-48'
          />
        </div>
        <div className='grid gap-2'>
          <Label htmlFor='ticket-search'>{t('service.tickets.search')}</Label>
          <Input
            id='ticket-search'
            value={q}
            className='w-64'
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        {me?.supervisor ? null : (
          <p className='text-xs text-muted-foreground'>
            {t('service.tickets.scopeHint')}
          </p>
        )}
      </div>
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {page ? (
        page.items.length === 0 ? (
          <EmptyState title={t('service.tickets.empty')} />
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('service.tickets.ticketNo')}</TableHead>
                  <TableHead>{t('service.tickets.fieldTitle')}</TableHead>
                  <TableHead>{t('service.tickets.customer')}</TableHead>
                  <TableHead>{t('service.tickets.device')}</TableHead>
                  <TableHead>{t('service.tickets.priority')}</TableHead>
                  <TableHead>{t('service.tickets.status')}</TableHead>
                  <TableHead>{t('service.tickets.dueAt')}</TableHead>
                  <TableHead>{t('service.field.updatedAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell className='font-mono text-xs'>
                      <Link
                        className='text-primary underline-offset-4 hover:underline'
                        to={{
                          pathname: String(ticket.id),
                          search: location.search,
                        }}
                      >
                        {ticket.ticketNo}
                      </Link>
                    </TableCell>
                    <TableCell className='max-w-[24rem]'>
                      <Link
                        className='font-medium underline-offset-4 hover:underline'
                        to={{
                          pathname: String(ticket.id),
                          search: location.search,
                        }}
                      >
                        {ticket.title}
                      </Link>
                      {ticket.confidential ? (
                        <span className='ml-2 text-xs text-muted-foreground'>
                          {t('service.tickets.confidential')}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {ticket.customerName ?? '—'}
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {ticket.deviceSerial
                        ? `${ticket.deviceSerial}${ticket.deviceName ? ` · ${ticket.deviceName}` : ''}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {t(`service.priority.${ticket.priority}`)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={ticket.status} />
                    </TableCell>
                    <TableCell>{formatDateTime(ticket.dueAt)}</TableCell>
                    <TableCell className='text-muted-foreground'>
                      {formatDateTime(ticket.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : null}
      <Outlet />
    </PageContainer>
  );
}
