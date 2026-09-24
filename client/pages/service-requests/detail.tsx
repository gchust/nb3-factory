/**
 * Service request detail — what a supervisor or assignee opens from the list
 * or from an in-app message. It reads the stored record only; the acceptance
 * workflow's step-by-step execution lives in the Workflow management pages the
 * automation plugin already provides.
 */
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeftIcon, BellIcon, WorkflowIcon } from 'lucide-react';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { Link, useParams } from 'react-router';

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
import { Separator } from '@/components/ui/separator';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';

import {
  getServiceRequest,
  listServiceRequestAssignees,
  type ServiceRequest,
  type ServiceRequestAssignee,
} from './api.js';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function DefinitionRow({
  label,
  children,
}: {
  readonly label: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between'>
      <dt className='text-sm text-muted-foreground'>{label}</dt>
      <dd className='text-sm font-medium'>{children}</dd>
    </div>
  );
}

export default function ServiceRequestDetailPage(): ReactElement {
  const { t } = useTranslation();
  const client = useApiClient();
  const { id } = useParams<{ id: string }>();

  const [request, setRequest] = useState<ServiceRequest>();
  const [assignees, setAssignees] = useState<readonly ServiceRequestAssignee[]>(
    [],
  );
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(
    async (numericId: number) => {
      const [nextRequest, nextAssignees] = await Promise.all([
        getServiceRequest(client, numericId),
        listServiceRequestAssignees(client),
      ]);
      setRequest(nextRequest);
      setAssignees(nextAssignees);
    },
    [client],
  );

  const load = useCallback(async () => {
    const numericId = Number(id);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) {
      setError(t('serviceRequests.notFound'));
      setLoading(false);
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      await fetchData(numericId);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setLoading(false);
    }
  }, [fetchData, id, t]);

  // The first load runs through a resolved promise so the effect body never
  // sets state synchronously; `load` owns the loading and error state.
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) {
        return load();
      }
      return undefined;
    });
    return () => {
      active = false;
    };
  }, [load]);

  const assignee = request
    ? assignees.find((candidate) => candidate.id === request.assigneeId)
    : undefined;
  const assigneeName =
    assignee?.name || assignee?.username || request?.assigneeId || '—';

  return (
    <PageContainer>
      <PageHeader
        title={
          <span className='inline-flex items-center gap-3'>
            <span className='font-mono'>
              {request?.reference ?? t('serviceRequests.title')}
            </span>
            {request ? (
              <Badge
                variant={request.status === 'accepted' ? 'default' : 'outline'}
              >
                {t(`serviceRequests.status.${request.status}`)}
              </Badge>
            ) : null}
            {request?.urgent ? (
              <Badge variant='destructive'>{t('serviceRequests.urgent')}</Badge>
            ) : null}
          </span>
        }
        description={
          request
            ? formatDateTime(request.createdAt)
            : t('serviceRequests.loading')
        }
        actions={
          <>
            <Button variant='outline' render={<Link to='/service-requests' />}>
              <ArrowLeftIcon data-icon='inline-start' />
              {t('serviceRequests.backToList')}
            </Button>
            <Button variant='outline' render={<Link to='/messages' />}>
              <BellIcon data-icon='inline-start' />
              {t('serviceRequests.openMessages')}
            </Button>
          </>
        }
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('serviceRequests.loadFailed')}</AlertTitle>
          <AlertDescription className='flex items-center justify-between gap-3'>
            {error}
            <Button size='sm' variant='outline' onClick={() => void load()}>
              {t('serviceRequests.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {request ? (
        <Card>
          <CardHeader>
            <CardTitle>{request.title}</CardTitle>
            <CardDescription>
              {t('serviceRequests.detailDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className='divide-y'>
              <DefinitionRow label={t('serviceRequests.columns.assignee')}>
                {assigneeName}
              </DefinitionRow>
              <DefinitionRow label={t('serviceRequests.columns.status')}>
                {t(`serviceRequests.status.${request.status}`)}
              </DefinitionRow>
              <DefinitionRow label={t('serviceRequests.columns.result')}>
                {request.result
                  ? t(`serviceRequests.result.${request.result}`)
                  : t('serviceRequests.resultPending')}
              </DefinitionRow>
              <DefinitionRow label={t('serviceRequests.acceptedAt')}>
                {formatDateTime(request.acceptedAt)}
              </DefinitionRow>
              <DefinitionRow label={t('serviceRequests.createdAt')}>
                {formatDateTime(request.createdAt)}
              </DefinitionRow>
              <DefinitionRow label={t('serviceRequests.updatedAt')}>
                {formatDateTime(request.updatedAt)}
              </DefinitionRow>
            </dl>
            <Separator className='my-4' />
            <p className='flex items-start gap-2 text-sm text-muted-foreground'>
              <WorkflowIcon className='mt-0.5 size-4 shrink-0' />
              {t('serviceRequests.workflowHint')}
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('serviceRequests.loading')}</CardTitle>
          </CardHeader>
        </Card>
      ) : null}
    </PageContainer>
  );
}
