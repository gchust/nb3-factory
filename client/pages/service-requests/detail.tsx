import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeftIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import {
  acceptServiceRequest,
  fetchServiceRequest,
  fetchServiceRequestAssignees,
  type ServiceRequest,
  type ServiceRequestAssignee,
} from './api.js';

interface DetailState {
  readonly key: string;
  readonly request?: ServiceRequest;
  readonly assignees?: ServiceRequestAssignee[];
  readonly error?: unknown;
}

/**
 * One service request. The supervisor accepts it from here: the accept action
 * runs the acceptance workflow and the page shows the outcome the workflow
 * recorded, so the request itself reflects the run's result.
 */
export default function ServiceRequestDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const parsedId = Number(id);
  const valid = Number.isInteger(parsedId) && parsedId > 0;
  const [revision, setRevision] = useState(0);
  const requestKey = `${id}:${String(revision)}`;
  const [state, setState] = useState<DetailState>();
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string>();

  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    Promise.all([
      fetchServiceRequest(api, parsedId, controller.signal),
      fetchServiceRequestAssignees(api, controller.signal),
    ]).then(
      ([request, assignees]) => {
        if (!controller.signal.aborted)
          setState({ key: requestKey, request, assignees });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ key: requestKey, error });
      },
    );
    return () => controller.abort();
  }, [api, parsedId, requestKey, valid]);

  // An id that cannot address a request never loads, so it reports the same
  // not-found state the endpoint would return rather than setting it from an
  // effect.
  const loading = valid && state?.key !== requestKey;
  const error = !valid
    ? new Error('NOT_FOUND')
    : loading
      ? undefined
      : state?.error;
  const request = state?.request;
  const assigneeName = useMemo(() => {
    if (!request) return undefined;
    return (
      state?.assignees?.find((assignee) => assignee.id === request.assigneeId)
        ?.name ?? request.assigneeId
    );
  }, [request, state?.assignees]);

  function messageFor(reason: unknown, fallbackKey: string): string {
    if (reason instanceof ApiClientError) {
      if (reason.code === 'SERVICE_REQUEST_WORKFLOW_UNAVAILABLE')
        return t('serviceRequest.detail.workflowUnavailable');
      if (reason.code === 'NOT_FOUND')
        return t('serviceRequest.detail.notFound');
      if (reason.code === 'SERVICE_REQUEST_WORKFLOW_FAILED')
        return t('serviceRequest.detail.acceptFailed');
    }
    return t(fallbackKey);
  }

  async function accept(): Promise<void> {
    if (!request) return;
    setAccepting(true);
    setAcceptError(undefined);
    try {
      const receipt = await acceptServiceRequest(api, request.id);
      setState((current) => ({
        ...current,
        key: requestKey,
        request: receipt.request,
        error: undefined,
      }));
    } catch (reason) {
      setAcceptError(messageFor(reason, 'serviceRequest.detail.acceptFailed'));
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <p className='text-sm text-muted-foreground' role='status'>
          {t('status.loadingPage')}
        </p>
      </PageContainer>
    );
  }

  if (error || !request) {
    return (
      <PageContainer>
        <PageHeader title={t('serviceRequest.detail.title')} />
        <Alert variant='destructive'>
          <AlertTitle>{t('serviceRequest.detail.loadFailed')}</AlertTitle>
          <AlertDescription className='flex items-center justify-between gap-3'>
            {messageFor(error, 'serviceRequest.detail.loadFailed')}
            <Button
              size='sm'
              variant='outline'
              onClick={() => setRevision((value) => value + 1)}
            >
              {t('serviceRequest.retry')}
            </Button>
          </AlertDescription>
        </Alert>
        <Button variant='outline' render={<Link to='/service-requests' />}>
          <ArrowLeftIcon data-icon='inline-start' />
          {t('serviceRequest.detail.back')}
        </Button>
      </PageContainer>
    );
  }

  const accepted = request.status === 'accepted';

  return (
    <PageContainer>
      <PageHeader
        title={request.title}
        description={t('serviceRequest.detail.description')}
        actions={
          accepted ? null : (
            <Button onClick={() => void accept()} disabled={accepting}>
              {accepting
                ? t('serviceRequest.detail.accepting')
                : t('serviceRequest.detail.accept')}
            </Button>
          )
        }
      />

      {acceptError ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('serviceRequest.detail.acceptFailed')}</AlertTitle>
          <AlertDescription>{acceptError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('serviceRequest.detail.detailsTitle')}</CardTitle>
          <CardDescription>
            {t('serviceRequest.detail.stepsHint')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-1'>
              <dt className='text-sm text-muted-foreground'>
                {t('serviceRequest.columns.priority')}
              </dt>
              <dd>
                <Badge variant={request.urgent ? 'destructive' : 'secondary'}>
                  {request.urgent
                    ? t('serviceRequest.priority.urgent')
                    : t('serviceRequest.priority.normal')}
                </Badge>
              </dd>
            </div>
            <div className='space-y-1'>
              <dt className='text-sm text-muted-foreground'>
                {t('serviceRequest.columns.assignee')}
              </dt>
              <dd>{assigneeName}</dd>
            </div>
            <div className='space-y-1'>
              <dt className='text-sm text-muted-foreground'>
                {t('serviceRequest.columns.status')}
              </dt>
              <dd>
                <Badge variant={accepted ? 'default' : 'outline'}>
                  {t(`serviceRequest.status.${request.status}`, {
                    defaultValue: request.status,
                  })}
                </Badge>
              </dd>
            </div>
            <div className='space-y-1'>
              <dt className='text-sm text-muted-foreground'>
                {t('serviceRequest.columns.result')}
              </dt>
              <dd>
                {request.result
                  ? t(`serviceRequest.result.${request.result}`, {
                      defaultValue: request.result,
                    })
                  : t('serviceRequest.result.none')}
              </dd>
            </div>
            <div className='space-y-1'>
              <dt className='text-sm text-muted-foreground'>
                {t('serviceRequest.detail.acceptedAt')}
              </dt>
              <dd>
                {request.acceptedAt
                  ? new Date(request.acceptedAt).toLocaleString()
                  : t('serviceRequest.result.none')}
              </dd>
            </div>
            <div className='space-y-1'>
              <dt className='text-sm text-muted-foreground'>
                {t('serviceRequest.columns.createdAt')}
              </dt>
              <dd>{new Date(request.createdAt).toLocaleString()}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Button variant='outline' render={<Link to='/service-requests' />}>
        <ArrowLeftIcon data-icon='inline-start' />
        {t('serviceRequest.detail.back')}
      </Button>
    </PageContainer>
  );
}
