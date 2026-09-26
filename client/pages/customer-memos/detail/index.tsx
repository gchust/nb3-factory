import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import type {
  CustomerMemo,
  CustomerMemoDetailOutletContext,
  CustomerMemosOutletContext,
} from '../types.js';

/** Route `/customer-memos/:memoId`: the read-only detail drawer. */
export default function CustomerMemoDetailPage(): ReactElement {
  const { memoId = '' } = useParams();
  // Key by id so forward/back to another record starts the drawer's state over.
  return <CustomerMemoDetail key={memoId} memoId={memoId} />;
}

function CustomerMemoDetail({
  memoId,
}: {
  readonly memoId: string;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const { reload } = useOutletContext<CustomerMemosOutletContext>();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${memoId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly memo?: CustomerMemo;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${memoId}:${reloadCount}`;
    api
      .request<{ data: CustomerMemo }>({
        path: `customer-memos/${encodeURIComponent(memoId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, memo: data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setResult({ key, error });
          // The row behind may still be there, so refresh the list when the record is gone.
          if (error instanceof ApiClientError && error.status === 404) reload();
        },
      );
    return () => controller.abort();
  }, [api, memoId, reloadCount, reload]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;

  // After an edit saves, show the returned record immediately instead of waiting for the reload.
  const [saved, setSaved] = useState<CustomerMemo>();
  const [gone, setGone] = useState(false);

  const notFound = gone || status === 404;
  const memo = notFound ? undefined : (saved ?? result?.memo);

  const outletContext = useMemo<CustomerMemoDetailOutletContext>(
    () => ({
      onSaved: (updated) => {
        setSaved(updated);
        reload();
      },
      onNotFound: () => {
        setGone(true);
        reload();
      },
    }),
    [reload],
  );

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale || undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  let body: ReactElement;
  if (notFound) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('customerMemos.notFound')}</AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('customerMemos.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!memo) {
    body = (
      <div role='status' aria-label={t('status.loading')} className='space-y-3'>
        <Skeleton className='h-4 w-1/2' />
        <Skeleton className='h-4 w-1/3' />
        <Skeleton className='h-4 w-2/3' />
      </div>
    );
  } else {
    body = (
      <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm'>
        <dt className='text-muted-foreground'>
          {t('customerMemos.fields.name')}
        </dt>
        <dd className='min-w-0 wrap-anywhere font-medium'>{memo.name}</dd>
        <dt className='text-muted-foreground'>
          {t('customerMemos.fields.note')}
        </dt>
        <dd className='min-w-0 whitespace-pre-wrap wrap-anywhere'>
          {memo.note ?? '—'}
        </dd>
        <dt className='text-muted-foreground'>
          {t('customerMemos.fields.createdAt')}
        </dt>
        <dd>{dateFormat.format(new Date(memo.createdAt))}</dd>
      </dl>
    );
  }

  return (
    <RouteDrawer
      title={memo?.name ?? t('customerMemos.detailTitle')}
      footer={memo ? <CustomerMemoDetailActions /> : undefined}
    >
      {body}
      {/* The edit dialog is a child route and stacks here, outside the state branches so it is not unmounted when the
          drawer switches between loading, not-found and loaded. */}
      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}

/** Rendered inside the drawer, so it can link to the edit child route and keep the list's query parameters. */
function CustomerMemoDetailActions(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <Button
      nativeButton={false}
      render={<Link to={{ pathname: 'edit', search: location.search }} />}
    >
      {t('customerMemos.edit')}
    </Button>
  );
}
