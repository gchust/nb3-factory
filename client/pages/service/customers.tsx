import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Outlet } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/pages/service/shared.js';
import {
  formatDateTime,
  useActionFeedback,
  useServiceList,
  useServiceMe,
} from '@/pages/service/service-api.js';
import type { Customer } from '@/pages/service/types.js';

interface Draft {
  name: string;
  contactName: string;
  phone: string;
  address: string;
  note: string;
}

const EMPTY: Draft = {
  name: '',
  contactName: '',
  phone: '',
  address: '',
  note: '',
};

export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const me = useServiceMe();
  const feedback = useActionFeedback();
  const { data, error, loading, reload } = useServiceList<Customer>(
    'service/customers',
    undefined,
    '',
  );
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);

  const update = (field: keyof Draft, value: string): void =>
    setDraft((current) => ({ ...current, [field]: value }));

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await api.request({
        path: 'service/customers',
        method: 'POST',
        json: {
          name: draft.name,
          contactName: draft.contactName || undefined,
          phone: draft.phone || undefined,
          address: draft.address || undefined,
          note: draft.note || undefined,
        },
      });
      feedback.success(t('service.customers.created'));
      setDraft(EMPTY);
      setOpen(false);
      reload();
    } catch (saveError) {
      feedback.failure(saveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.customers.title')}
        description={t('service.customers.description')}
        actions={
          me?.supervisor ? (
            <Button
              variant='outline'
              onClick={() => setOpen((value) => !value)}
            >
              <PlusIcon data-icon='inline-start' />
              {t('service.customers.create')}
            </Button>
          ) : null
        }
      />
      {open ? (
        <Card>
          <CardContent className='grid gap-4 pt-6 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label htmlFor='customer-name'>
                {t('service.customers.name')}
              </Label>
              <Input
                id='customer-name'
                value={draft.name}
                onChange={(event) => update('name', event.target.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='customer-contact'>
                {t('service.customers.contact')}
              </Label>
              <Input
                id='customer-contact'
                value={draft.contactName}
                onChange={(event) => update('contactName', event.target.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='customer-phone'>
                {t('service.customers.phone')}
              </Label>
              <Input
                id='customer-phone'
                value={draft.phone}
                onChange={(event) => update('phone', event.target.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='customer-address'>
                {t('service.customers.address')}
              </Label>
              <Input
                id='customer-address'
                value={draft.address}
                onChange={(event) => update('address', event.target.value)}
              />
            </div>
            <div className='grid gap-2 sm:col-span-2'>
              <Label htmlFor='customer-note'>
                {t('service.customers.note')}
              </Label>
              <Textarea
                id='customer-note'
                value={draft.note}
                onChange={(event) => update('note', event.target.value)}
              />
            </div>
            <div className='flex gap-2 sm:col-span-2'>
              <Button
                disabled={saving || draft.name.trim() === ''}
                onClick={() => void save()}
              >
                {t('actions.save')}
              </Button>
              <Button variant='ghost' onClick={() => setOpen(false)}>
                {t('actions.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {data ? (
        data.length === 0 ? (
          <EmptyState
            title={t('service.customers.empty')}
            description={t('service.customers.emptyHint')}
          />
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('service.customers.name')}</TableHead>
                  <TableHead>{t('service.customers.contact')}</TableHead>
                  <TableHead>{t('service.customers.phone')}</TableHead>
                  <TableHead>{t('service.customers.address')}</TableHead>
                  <TableHead>{t('service.field.updatedAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className='font-medium'>
                      {customer.name}
                    </TableCell>
                    <TableCell>{customer.contactName ?? '—'}</TableCell>
                    <TableCell>{customer.phone ?? '—'}</TableCell>
                    <TableCell>{customer.address ?? '—'}</TableCell>
                    <TableCell className='text-muted-foreground'>
                      {formatDateTime(customer.updatedAt)}
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
