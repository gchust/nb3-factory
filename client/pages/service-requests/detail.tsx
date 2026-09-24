/**
 * Service request detail — a URL-addressable child-route drawer.
 *
 * The acceptance notification's Open link points at `/service-requests/:id`, so
 * this drawer is the destination the assignee lands on after opening the in-app
 * message; a refresh or a shared link restores it.
 *
 * The accept action lives in the footer, which is rendered inside `RouteDrawer`
 * and is therefore the only place allowed to call `useRouteOverlay`.
 */
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, CheckIcon, RefreshCwIcon } from 'lucide-react';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { useOutletContext, useParams } from 'react-router';

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
import { Spinner } from '@/components/ui/spinner';
import { Toaster, toast } from '@/components/ui/toast';
import { useRouteOverlay } from '@/components/use-route-overlay';

import {
  ServiceRequestResultBadge,
  ServiceRequestStatusBadge,
} from './status-badge.js';
import { waitForAcceptance } from './acceptance.js';
import {
  type ServiceRequest,
  type ServiceRequestAssignee,
  type ServiceRequestsOutletContext,
} from './types.js';

interface DetailResult {
  readonly key: string;
  readonly request?: ServiceRequest;
  readonly assignees?: ServiceRequestAssignee[];
  readonly error?: unknown;
}

const DETAIL_LOADING_ROWS = [
  'urgent',
  'assignee',
  'status',
  'result',
  'createdAt',
  'updatedAt',
] as const;

export default function ServiceRequestDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { locale } = useLocale();
  const { serviceRequestId = '' } = useParams();
  const { reload } = useOutletContext<ServiceRequestsOutletContext>();
  const [reloadCount, refresh] = useReducer((count: number) => count + 1, 0);
  const requestKey = `${serviceRequestId}:${reloadCount}`;
  const [result, setResult] = useState<DetailResult>();
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const key = `${serviceRequestId}:${reloadCount}`;
    Promise.all([
      api.request<{ data: ServiceRequest }>({
        path: `service-requests/${encodeURIComponent(serviceRequestId)}`,
        signal: controller.signal,
      }),
      api.request<{ data: ServiceRequestAssignee[] }>({
        path: 'service-requests/assignees',
        signal: controller.signal,
      }),
    ]).then(
      ([request, assignees]) => {
        if (!controller.signal.aborted) {
          setResult({
            key,
            request: request.data,
            assignees: assignees.data,
          });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount, serviceRequestId]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const request = result?.request;
  const assigneeName = useMemo(() => {
    if (!request?.assigneeId) return undefined;
    return result?.assignees?.find(
      (assignee) => assignee.id === request.assigneeId,
    )?.name;
  }, [request, result?.assignees]);

  const accept = useCallback(async (): Promise<void> => {
    if (!request) return;
    setAccepting(true);
    try {
      await api.request({
        path: `service-requests/${request.id}/accept`,
        method: 'POST',
      });
      // The workflow runs asynchronously; wait for the record to settle so the
      // drawer and the list behind it show the accepted result.
      await waitForAcceptance(api, request.id);
      toast.add({
        type: 'success',
        title: t('serviceRequests.accepted'),
        description: request.title,
      });
      // Refresh the drawer with the accepted record and the list behind it.
      refresh();
      reload();
    } catch (reason) {
      toast.add({
        type: 'error',
        title: t('serviceRequests.acceptFailed'),
        description:
          reason instanceof ApiClientError && reason.status === 403
            ? t('serviceRequests.acceptForbidden')
            : t('serviceRequests.acceptFailedDescription'),
      });
    } finally {
      setAccepting(false);
    }
  }, [api, reload, request, t]);

  return (
    <>
      <Toaster />
      <RouteDrawer
        description={
          request
            ? t('serviceRequests.detail.createdAt', {
                time: formatTime(request.createdAt, locale),
              })
            : undefined
        }
        footer={
          <DetailFooter
            accepting={accepting}
            request={request}
            onAccept={() => void accept()}
          />
        }
        title={request?.title ?? t('serviceRequests.detail.title')}
      >
        <DetailBody
          assigneeName={assigneeName}
          error={error}
          loading={loading}
          request={request}
          onRetry={refresh}
        />
      </RouteDrawer>
    </>
  );
}

function DetailBody({
  assigneeName,
  error,
  loading,
  onRetry,
  request,
}: {
  readonly assigneeName?: string;
  readonly error: unknown;
  readonly loading: boolean;
  readonly onRetry: () => void;
  readonly request?: ServiceRequest;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();

  if (loading && !request) {
    return (
      <div
        aria-label={t('status.loading')}
        className='grid gap-4 sm:grid-cols-2'
        role='status'
      >
        {DETAIL_LOADING_ROWS.map((row) => (
          <div key={row} className='space-y-2'>
            <Skeleton className='h-3 w-20' />
            <Skeleton className='h-4 w-32' />
          </div>
        ))}
      </div>
    );
  }

  if (error || !request) {
    const notFound = error instanceof ApiClientError && error.status === 404;
    return (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('serviceRequests.error.title')}</AlertTitle>
        <AlertDescription>
          <span>
            {notFound
              ? t('serviceRequests.detail.notFound')
              : error instanceof ApiClientError && error.status === 403
                ? t('serviceRequests.error.forbidden')
                : t('serviceRequests.error.requestFailed')}
          </span>
          {notFound ? null : (
            <AlertAction>
              <Button size='sm' variant='outline' onClick={onRetry}>
                <RefreshCwIcon data-icon='inline-start' />
                {t('status.retry')}
              </Button>
            </AlertAction>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className='space-y-6'>
      <dl className='grid gap-4 sm:grid-cols-2'>
        <DetailField label={t('serviceRequests.columns.urgent')}>
          {request.urgent
            ? t('serviceRequests.urgent')
            : t('serviceRequests.normal')}
        </DetailField>
        <DetailField label={t('serviceRequests.columns.assignee')}>
          {assigneeName ?? <span className='text-muted-foreground'>—</span>}
        </DetailField>
        <DetailField label={t('serviceRequests.columns.status')}>
          <ServiceRequestStatusBadge status={request.status} />
        </DetailField>
        <DetailField label={t('serviceRequests.columns.result')}>
          <ServiceRequestResultBadge result={request.result} />
        </DetailField>
        <DetailField label={t('serviceRequests.detail.createdAtLabel')}>
          {formatTime(request.createdAt, locale)}
        </DetailField>
        <DetailField label={t('serviceRequests.detail.updatedAtLabel')}>
          {formatTime(request.updatedAt, locale)}
        </DetailField>
      </dl>
      <Separator />
      <p className='text-sm leading-6 text-muted-foreground'>
        {t('serviceRequests.detail.hint')}
      </p>
    </div>
  );
}

function DetailField({
  children,
  label,
}: {
  readonly children: ReactNode;
  readonly label: string;
}): ReactElement {
  return (
    <div className='space-y-1'>
      <dt className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function DetailFooter({
  accepting,
  onAccept,
  request,
}: {
  readonly accepting: boolean;
  readonly onAccept: () => void;
  readonly request?: ServiceRequest;
}): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <>
      <Button
        disabled={isClosing}
        type='button'
        variant='outline'
        onClick={() => void close()}
      >
        {t('actions.close')}
      </Button>
      {request?.status === 'pending' ? (
        <Button disabled={accepting} type='button' onClick={onAccept}>
          {accepting ? (
            <Spinner data-icon='inline-start' />
          ) : (
            <CheckIcon data-icon='inline-start' />
          )}
          {t('serviceRequests.accept')}
        </Button>
      ) : null}
    </>
  );
}

function formatTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
