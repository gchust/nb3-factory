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
import { useRouteOverlay } from '@/components/use-route-overlay';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { CustomerMemoDeleteDialog } from '../customer-memo-delete-dialog.js';
import type {
  CustomerMemo,
  CustomerMemoDetailOutletContext,
  CustomerMemosOutletContext,
} from '../types.js';

/** Route `/customer-memos/:memoId`: the memo detail drawer. */
export default function CustomerMemoDetailPage(): ReactElement {
  const { memoId = '' } = useParams();
  // Key by id: when forward or back switches to another record, the drawer's state starts over.
  return <CustomerMemoDetail key={memoId} memoId={memoId} />;
}

function CustomerMemoDetail({
  memoId,
}: {
  readonly memoId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  // Functions the list page passes down through <Outlet context>.
  const { reload: reloadList, afterDelete } =
    useOutletContext<CustomerMemosOutletContext>();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${memoId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly memo?: CustomerMemo;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    // Abort the request when the parameters change or the component unmounts, so an old result never overwrites a new one.
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
          // The record no longer exists: the list behind may still show its row, so refresh the list.
          if (error instanceof ApiClientError && error.status === 404) {
            reloadList();
          }
        },
      );
    return () => controller.abort();
  }, [api, memoId, reloadCount, reloadList]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;

  // After an edit is saved, show the record the endpoint returned right away instead of waiting for a reload.
  const [saved, setSaved] = useState<CustomerMemo>();
  // The edit dialog found that the record no longer exists.
  const [gone, setGone] = useState(false);

  const notFound = gone || status === 404;
  const memo = notFound ? undefined : (saved ?? result?.memo);

  // The edit dialog (child route edit) gets these two callbacks through <Outlet context>.
  // Keep them stable with useMemo: the dialog's loading effect depends on them.
  const outletContext = useMemo<CustomerMemoDetailOutletContext>(
    () => ({
      onSaved: (updated) => {
        setSaved(updated);
        reloadList();
      },
      onNotFound: () => {
        setGone(true);
        reloadList();
      },
    }),
    [reloadList],
  );

  let body: ReactElement;
  if (notFound || status === 403) {
    // Record not found or no permission: a retry will not succeed either, so only explain the situation.
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>
          {notFound
            ? t('customerMemos.notFound.title')
            : t('customerMemos.error.title')}
        </AlertTitle>
        <AlertDescription>
          {notFound
            ? t('customerMemos.notFound.description')
            : t('customerMemos.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('customerMemos.error.title')}</AlertTitle>
        <AlertDescription>
          {t('customerMemos.error.requestFailed')}
        </AlertDescription>
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
    body = <MemoFieldSkeleton label={t('status.loading')} />;
  } else {
    body = <MemoFields memo={memo} />;
  }

  return (
    <RouteDrawer
      title={memo?.name ?? t('customerMemos.detail.title')}
      // Show no record actions before the record has loaded or when it does not exist.
      footer={
        memo ? (
          <MemoDetailActions memo={memo} onDeleted={afterDelete} />
        ) : undefined
      }
    >
      {body}
      {/* The edit dialog (child route edit) renders inside the drawer, stacked on it; placed outside the state branches, it is not unmounted when the drawer switches state. */}
      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}

/**
 * Record actions at the bottom of the drawer. The footer renders inside the drawer, so useRouteOverlay() can be called here.
 * The footer is justify-end: the two buttons sit together on the right, and "Edit" is the only primary button in this view.
 */
function MemoDetailActions({
  memo,
  onDeleted,
}: {
  readonly memo: CustomerMemo;
  readonly onDeleted: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const { close } = useRouteOverlay();
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <Button variant='destructive' onClick={() => setDeleteOpen(true)}>
        {t('customerMemos.actions.delete')}
      </Button>
      {/* Edit is a child route: the button renders as a link that keeps the query parameters, so the search of the list behind stays the same. */}
      <Button
        nativeButton={false}
        render={<Link to={{ pathname: 'edit', search: location.search }} />}
      >
        {t('customerMemos.actions.edit')}
      </Button>
      {/* The delete confirmation uses component state. On success, first let the list refresh and arrange focus, then close the drawer. */}
      <CustomerMemoDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        memo={memo}
        onDeleted={() => {
          onDeleted();
          void close();
        }}
      />
    </>
  );
}

function MemoFields({ memo }: { readonly memo: CustomerMemo }): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  return (
    <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm'>
      <dt className='text-muted-foreground'>
        {t('customerMemos.fields.name')}
      </dt>
      <dd className='min-w-0 wrap-anywhere'>{memo.name}</dd>
      <dt className='text-muted-foreground'>
        {t('customerMemos.fields.notes')}
      </dt>
      <dd className='min-w-0 whitespace-pre-wrap wrap-anywhere'>
        {memo.notes ?? '—'}
      </dd>
      <dt className='text-muted-foreground'>
        {t('customerMemos.fields.createdAt')}
      </dt>
      <dd>{dateFormat.format(new Date(memo.createdAt))}</dd>
      <dt className='text-muted-foreground'>
        {t('customerMemos.fields.updatedAt')}
      </dt>
      <dd>{dateFormat.format(new Date(memo.updatedAt))}</dd>
    </dl>
  );
}

function MemoFieldSkeleton({
  label,
}: {
  readonly label: string;
}): ReactElement {
  return (
    <div role='status' aria-label={label} className='space-y-3'>
      <Skeleton className='h-4 w-1/2' />
      <Skeleton className='h-4 w-1/3' />
      <Skeleton className='h-4 w-2/3' />
    </div>
  );
}
