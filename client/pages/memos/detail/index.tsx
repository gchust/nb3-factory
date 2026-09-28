import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircleIcon,
  FileQuestionIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { fetchMemo } from '../memo-api.js';
import { MemoDeleteDialog } from '../memo-delete-dialog.js';
import type {
  CustomerMemo,
  MemoDetailOutletContext,
  MemosOutletContext,
} from '../types.js';
import { useDateTimeFormat } from '../use-date-time-format.js';

type DetailState =
  | { readonly kind: 'ready'; readonly memo: CustomerMemo }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'error'; readonly error: unknown };

/**
 * The detail drawer, reached at `/memos/:memoId`.
 *
 * It owns the memo, its loading and error state, and the delete confirmation; the edit dialog is its child route and
 * reports back through `<Outlet context>`.
 */
export default function MemoDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { memoId } = useParams();
  const { afterDelete, reload } = useOutletContext<MemosOutletContext>();
  const [reloadCount, retry] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([memoId, reloadCount]);

  // No effect calls setState synchronously: the state carries the key of the request it came from, and "loading" is
  // derived from whether that key is the current one.
  const [result, setResult] = useState<{
    readonly key: string;
    readonly status?: DetailState;
  }>({ key: '' });
  const loading = result.key !== requestKey;
  const status = loading ? undefined : result.status;
  const remoteDeletedRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([memoId, reloadCount]);
    fetchMemo(api, memoId ?? '', controller.signal).then(
      (loaded) => {
        if (!controller.signal.aborted) {
          setResult({ key, status: { kind: 'ready', memo: loaded } });
        }
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        if (caught instanceof ApiClientError && caught.status === 404) {
          setResult({ key, status: { kind: 'notFound' } });
        } else {
          setResult({ key, status: { kind: 'error', error: caught } });
        }
      },
    );
    return () => controller.abort();
  }, [api, memoId, reloadCount]);

  // Once a remote deletion is detected, refresh the list so the row disappears behind the drawer.
  useEffect(() => {
    if (status?.kind === 'notFound' && !remoteDeletedRef.current) {
      remoteDeletedRef.current = true;
      afterDelete();
    }
  }, [afterDelete, status]);

  const [deletion, setDeletion] = useState<{
    readonly open: boolean;
    readonly memo: CustomerMemo | null;
  }>({ open: false, memo: null });

  const outletContext = useMemo<MemoDetailOutletContext>(
    () => ({
      onSaved: (saved) => {
        setResult({ key: requestKey, status: { kind: 'ready', memo: saved } });
        reload();
      },
      onNotFound: () => {
        setResult({ key: requestKey, status: { kind: 'notFound' } });
      },
    }),
    [reload, requestKey],
  );

  const title =
    status?.kind === 'ready' ? status.memo.name : t('memos.detail.title');

  return (
    <RouteDrawer title={title}>
      <DetailContent
        loading={loading}
        status={status}
        onRetry={retry}
        outletContext={outletContext}
        deletion={deletion}
        onDeleteRequest={(target) => setDeletion({ open: true, memo: target })}
        onDeleteOpenChange={(open) =>
          setDeletion((current) => ({ ...current, open }))
        }
        onDeleted={() => {
          setDeletion((current) => ({ ...current, open: false }));
          setResult({ key: requestKey, status: { kind: 'notFound' } });
          if (!remoteDeletedRef.current) {
            remoteDeletedRef.current = true;
            afterDelete();
          }
        }}
      />
    </RouteDrawer>
  );
}

interface DetailContentProps {
  readonly loading: boolean;
  readonly status: DetailState | undefined;
  readonly onRetry: () => void;
  readonly outletContext: MemoDetailOutletContext;
  readonly deletion: {
    readonly open: boolean;
    readonly memo: CustomerMemo | null;
  };
  readonly onDeleteRequest: (memo: CustomerMemo) => void;
  readonly onDeleteOpenChange: (open: boolean) => void;
  readonly onDeleted: () => void;
}

/**
 * The drawer body and footer. It is a component of its own so `useRouteOverlay()` reads this drawer's context rather
 * than the overlay that contains the page.
 */
function DetailContent({
  loading,
  status,
  onRetry,
  outletContext,
  deletion,
  onDeleteRequest,
  onDeleteOpenChange,
  onDeleted,
}: DetailContentProps): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  const location = useLocation();
  const dateFormat = useDateTimeFormat();

  if (loading) {
    return (
      <div
        className='flex flex-col gap-4'
        role='status'
        aria-label={t('status.loading')}
      >
        <Skeleton className='h-5 w-40' />
        <Skeleton className='h-4 w-56' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
  }

  if (status?.kind === 'notFound') {
    return (
      <>
        <Alert>
          <FileQuestionIcon />
          <AlertTitle>{t('memos.detail.notFound.title')}</AlertTitle>
          <AlertDescription>
            {t('memos.detail.notFound.description')}
          </AlertDescription>
          <AlertAction>
            <Button
              variant='outline'
              size='sm'
              render={<Link to={{ pathname: '..', search: location.search }} />}
              nativeButton={false}
            >
              {t('memos.detail.backToList')}
            </Button>
          </AlertAction>
        </Alert>
        {/* Keep the edit route reachable so a direct `/memos/:id/edit` URL can render its own not-found handling. */}
        <Outlet context={outletContext} />
      </>
    );
  }

  if (status?.kind !== 'ready') {
    const forbidden =
      status?.kind === 'error' &&
      status.error instanceof ApiClientError &&
      status.error.status === 403;
    return (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('memos.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('memos.error.forbidden')
            : t('memos.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={onRetry}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  }

  const { memo } = status;
  return (
    <>
      <div className='flex flex-col gap-6'>
        <dl className='flex flex-col gap-4'>
          <div className='flex flex-col gap-1'>
            <dt className='text-sm font-medium text-muted-foreground'>
              {t('memos.fields.createdAt')}
            </dt>
            <dd className='text-sm'>
              {dateFormat.format(new Date(memo.createdAt))}
            </dd>
          </div>
          <Separator />
          <div className='flex flex-col gap-1'>
            <dt className='text-sm font-medium text-muted-foreground'>
              {t('memos.fields.note')}
            </dt>
            <dd className='text-sm whitespace-pre-wrap'>
              {memo.note ? (
                memo.note
              ) : (
                <span className='text-muted-foreground'>
                  {t('memos.detail.noNote')}
                </span>
              )}
            </dd>
          </div>
        </dl>
        <div className='flex flex-wrap justify-end gap-2'>
          <Button
            variant='outline'
            render={<Link to={{ pathname: 'edit', search: location.search }} />}
            nativeButton={false}
          >
            <PencilIcon data-icon='inline-start' />
            {t('memos.actions.edit')}
          </Button>
          <Button variant='destructive' onClick={() => onDeleteRequest(memo)}>
            <Trash2Icon data-icon='inline-start' />
            {t('memos.actions.delete')}
          </Button>
        </div>
        <Button
          variant='ghost'
          className='self-start'
          onClick={() => void close()}
        >
          {t('actions.close')}
        </Button>
      </div>

      <MemoDeleteDialog
        open={deletion.open}
        onOpenChange={onDeleteOpenChange}
        memo={deletion.memo}
        onDeleted={onDeleted}
      />

      {/* The edit child route renders here. */}
      <Outlet context={outletContext} />
    </>
  );
}
