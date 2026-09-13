import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { StatusBadge } from '@/components/crm/badges';
import { CustomerFormDialog } from '@/components/crm/customer-form-dialog';
import {
  CrmEmpty,
  CrmErrorText,
  CrmLoading,
  useCrmError,
} from '@/components/crm/feedback';
import { useCrmApi, type Customer } from '@/components/crm/api';

export default function CrmCustomersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useCrmApi();
  const errorFor = useCrmError();
  const [customers, setCustomers] = useState<Customer[]>();
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback((): void => {
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void api
      .listCustomers({ search: search.trim() })
      .then((rows) => {
        if (!active) return;
        setCustomers(rows);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorFor(cause));
      });
    return () => {
      active = false;
    };
  }, [api, search, refreshKey, errorFor]);

  return (
    <section className='space-y-6 p-6'>
      <header className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {t('crm.customers.title')}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {t('crm.customers.subtitle')}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className='size-4' />
          {t('crm.customers.new')}
        </Button>
      </header>

      <Input
        aria-label={t('crm.common.search')}
        className='max-w-sm'
        placeholder={t('crm.customers.searchPlaceholder')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <CrmErrorText message={error} />

      {customers === undefined ? (
        <CrmLoading label={t('crm.common.loading')} />
      ) : customers.length === 0 ? (
        <CrmEmpty>{t('crm.customers.empty')}</CrmEmpty>
      ) : (
        <div className='rounded-xl border border-border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('crm.customers.name')}</TableHead>
                <TableHead>{t('crm.customers.industry')}</TableHead>
                <TableHead>{t('crm.customers.companySize')}</TableHead>
                <TableHead>{t('crm.customers.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <Link
                      className='font-medium text-primary hover:underline'
                      to={`/crm/customers/${customer.id}`}
                    >
                      {customer.name}
                    </Link>
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {customer.industry || t('crm.common.none')}
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {customer.companySize
                      ? t(`crm.companySize.${customer.companySize}`)
                      : t('crm.common.none')}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={customer.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CustomerFormDialog
        key={creating ? 'new' : 'closed'}
        open={creating}
        onOpenChange={setCreating}
        onSaved={refresh}
      />
    </section>
  );
}
