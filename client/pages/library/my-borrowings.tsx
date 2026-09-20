import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { cancelBorrow, listMyBorrowings, type BorrowingDto } from './api.js';
import { Alert, StatusBadge } from './components.js';
import { formatDateTime } from './format.js';

export default function MyBorrowingsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [rows, setRows] = useState<readonly BorrowingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listMyBorrowings(api));
    } catch {
      setError(t('library.error.generic'));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await listMyBorrowings(api);
        if (active) setRows(data);
      } catch {
        if (active) setError(t('library.error.generic'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, t]);

  const cancel = async (id: number): Promise<void> => {
    setBusy(true);
    try {
      await cancelBorrow(api, id);
      await load();
    } catch {
      setError(t('library.error.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <PageHeader
        description={t('library.myBorrowingsDescription')}
        title={t('library.myBorrowings')}
      />

      {error ? <Alert tone='error'>{error}</Alert> : null}

      {loading ? (
        <div className='flex items-center gap-2 py-10 text-sm text-muted-foreground'>
          <Spinner />
          {t('status.loading')}
        </div>
      ) : rows.length === 0 ? (
        <p className='rounded-lg border border-border p-8 text-center text-sm text-muted-foreground'>
          {t('library.myBorrowingsEmpty')}
        </p>
      ) : (
        <ul className='divide-y divide-border rounded-lg border border-border'>
          {rows.map((row) => (
            <li
              className='flex flex-wrap items-center gap-3 px-4 py-3'
              key={row.id}
            >
              <div className='min-w-0 flex-1'>
                <Link
                  className='text-sm font-medium hover:text-primary hover:underline'
                  to={`/library/${row.materialId}`}
                >
                  {row.materialTitle}
                </Link>
                <p className='text-xs text-muted-foreground'>
                  {t('library.requestedAt', {
                    time: formatDateTime(row.requestedAt),
                  })}
                  {row.borrowedAt
                    ? ` · ${t('library.borrowedAt', {
                        time: formatDateTime(row.borrowedAt),
                      })}`
                    : ''}
                  {row.returnedAt
                    ? ` · ${t('library.returnedAt', {
                        time: formatDateTime(row.returnedAt),
                      })}`
                    : ''}
                </p>
              </div>
              <StatusBadge status={row.status} />
              {row.status === 'pending' ? (
                <Button
                  disabled={busy}
                  onClick={() => void cancel(row.id)}
                  size='sm'
                  variant='outline'
                >
                  {t('library.cancelRequest')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
