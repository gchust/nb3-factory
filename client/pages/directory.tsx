import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Building2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

import { EmptyState } from '../components/sales/empty-state';
import { ErrorState } from '../components/sales/error-state';
import { PageHeader } from '../components/sales/page-header';
import { StatusBadge } from '../components/sales/status-badge';
import { useSalesApi } from '../components/sales/use-sales-api';
import type { Customer } from '../lib/sales-api';

/**
 * Public customer directory. The server restricts this page's data to public
 * customers and to the fields a visitor may read, so the page only renders
 * what the API returns.
 */
export default function DirectoryPage(): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async (): Promise<void> => {
    try {
      setCustomers(await api.directory({ q: q || undefined }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api, q]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  return (
    <div className='space-y-6'>
      <PageHeader
        description={t('sales.directory.description', {
          defaultValue: 'Companies that chose to be listed publicly',
        })}
        title={t('sales.directory.title', {
          defaultValue: 'Public customer directory',
        })}
      />

      <Input
        className='sm:max-w-xs'
        onChange={(event) => setQ(event.target.value)}
        placeholder={t('sales.directory.search', {
          defaultValue: 'Search companies…',
        })}
        value={q}
      />

      {error ? <ErrorState message={error} /> : null}

      {loading ? (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <Skeleton className='h-32 rounded-xl' key={item} />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <EmptyState
          message={t('sales.directory.empty', {
            defaultValue: 'No public customers yet.',
          })}
        />
      ) : (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {customers.map((customer) => (
            <Card key={customer.id}>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <Building2 className='size-4 text-muted-foreground' />
                  <span className='truncate'>{customer.name}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-2 text-sm'>
                <div className='flex items-center justify-between'>
                  <span className='text-muted-foreground'>
                    {t('sales.customers.industry', {
                      defaultValue: 'Industry',
                    })}
                  </span>
                  <span>{customer.industry ?? '—'}</span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-muted-foreground'>
                    {t('sales.customers.size', { defaultValue: 'Size' })}
                  </span>
                  <span>
                    {customer.size
                      ? t(`sales.sizes.${customer.size}`, {
                          defaultValue: customer.size,
                        })
                      : '—'}
                  </span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-muted-foreground'>
                    {t('sales.customers.status', { defaultValue: 'Status' })}
                  </span>
                  <StatusBadge prefix='customers' status={customer.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
