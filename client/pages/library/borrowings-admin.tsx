import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { Check, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import {
  confirmBorrow,
  confirmReturn,
  errorCode,
  listBorrowings,
  loadMe,
  type BorrowingDto,
  type BorrowingStatus,
} from './api.js';
import { Alert, StatusBadge } from './components.js';
import { formatDateTime } from './format.js';

const FILTERS: readonly (BorrowingStatus | 'all')[] = [
  'all',
  'pending',
  'borrowed',
  'returned',
  'cancelled',
];

export default function BorrowingsAdminPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<BorrowingStatus | 'all'>('pending');
  const [rows, setRows] = useState<readonly BorrowingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void loadMe(api)
      .then((profile) => setIsAdmin(profile.isAdmin))
      .catch(() => setIsAdmin(false));
  }, [api]);

  const load = useCallback(
    async (status: BorrowingStatus | 'all'): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        setRows(
          await listBorrowings(api, status === 'all' ? undefined : status),
        );
      } catch {
        setError(t('library.error.generic'));
      } finally {
        setLoading(false);
      }
    },
    [api, t],
  );

  useEffect(() => {
    if (isAdmin !== true) return;
    let active = true;
    void (async () => {
      try {
        const data = await listBorrowings(
          api,
          filter === 'all' ? undefined : filter,
        );
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
  }, [filter, isAdmin, api, t]);

  const act = async (
    id: number,
    action: 'borrow' | 'return',
  ): Promise<void> => {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      const result =
        action === 'borrow'
          ? await confirmBorrow(api, id)
          : await confirmReturn(api, id);
      setNotice(
        result.changed
          ? t('library.admin.actionDone')
          : t('library.admin.actionNoop'),
      );
      await load(filter);
    } catch (cause) {
      const code = errorCode(cause);
      if (code === 'OUT_OF_STOCK') setError(t('library.error.outOfStock'));
      else if (code === 'INVALID_STATUS')
        setError(t('library.error.invalidStatus'));
      else if (code === 'FORBIDDEN') setError(t('library.error.forbidden'));
      else setError(t('library.error.generic'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageContainer className='mx-auto max-w-5xl'>
      <PageHeader
        description={t('library.admin.description')}
        title={t('library.admin.title')}
      />

      {isAdmin === false ? (
        <Alert tone='info'>{t('library.admin.required')}</Alert>
      ) : null}

      {isAdmin ? (
        <>
          <div className='flex flex-wrap gap-2'>
            {FILTERS.map((item) => (
              <Button
                key={item}
                onClick={() => setFilter(item)}
                size='sm'
                variant={filter === item ? 'default' : 'outline'}
              >
                {item === 'all'
                  ? t('library.admin.filterAll')
                  : t(`library.status.${item}`)}
              </Button>
            ))}
          </div>

          {error ? <Alert tone='error'>{error}</Alert> : null}
          {notice ? <Alert tone='info'>{notice}</Alert> : null}

          {loading ? (
            <div className='flex items-center gap-2 py-10 text-sm text-muted-foreground'>
              <Spinner />
              {t('status.loading')}
            </div>
          ) : rows.length === 0 ? (
            <p className='rounded-lg border border-border p-8 text-center text-sm text-muted-foreground'>
              {t('library.admin.empty')}
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
                      {t('library.admin.borrower', {
                        name: row.borrowerName || row.userId,
                      })}
                      {' · '}
                      {t('library.requestedAt', {
                        time: formatDateTime(row.requestedAt),
                      })}
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                  {row.status === 'pending' ? (
                    <Button
                      disabled={busy === row.id}
                      onClick={() => void act(row.id, 'borrow')}
                      size='sm'
                    >
                      {busy === row.id ? <Spinner /> : <Check />}
                      {t('library.admin.confirmBorrow')}
                    </Button>
                  ) : null}
                  {row.status === 'borrowed' ? (
                    <Button
                      disabled={busy === row.id}
                      onClick={() => void act(row.id, 'return')}
                      size='sm'
                      variant='outline'
                    >
                      {busy === row.id ? <Spinner /> : <Undo2 />}
                      {t('library.admin.confirmReturn')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </PageContainer>
  );
}
