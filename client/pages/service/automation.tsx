import { useTranslation } from '@nocobase/i18n/client';
import { RefreshCw } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from './components/data-states.js';
import { StatusBadge } from './components/status-badge.js';
import { formatDateTime } from './lib/format.js';
import { useServiceClient } from './lib/use-service.js';
import { useServiceQuery } from './lib/use-service-query.js';

export default function ServiceAutomationPage(): ReactElement {
  const { t } = useTranslation();
  const client = useServiceClient();
  const [busy, setBusy] = useState<number>();

  const list = useServiceQuery(
    () => client.listAutomationRuns(),
    'automation-runs',
  );

  const retry = async (ticketId: number) => {
    setBusy(ticketId);
    try {
      await client.retryAutomation(ticketId);
      toast.success(t('service.automation.retried'));
      list.reload();
    } catch (cause) {
      toast.error(
        `${t('service.automation.retryFailed')}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        description={t('service.automation.description')}
        title={t('service.automation.title')}
      />
      <Card className='py-0'>
        <CardContent className='px-0'>
          {list.loading && !list.data ? <LoadingState /> : null}
          {list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : null}
          {list.data ? (
            list.data.items.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('service.automation.ticket')}</TableHead>
                    <TableHead>{t('service.automation.status')}</TableHead>
                    <TableHead>{t('service.automation.steps')}</TableHead>
                    <TableHead>{t('service.automation.error')}</TableHead>
                    <TableHead>{t('service.automation.createdAt')}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        <Link
                          className='font-mono text-xs underline'
                          to={`/service/tickets/${run.ticketId}`}
                        >
                          {run.ticketNo ?? `#${run.ticketId}`}
                        </Link>
                        <span className='block text-sm'>{run.title}</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={
                            run.status === 'succeeded'
                              ? t('service.automation.succeeded')
                              : t('service.automation.failed')
                          }
                          value={
                            run.status === 'succeeded'
                              ? 'completed'
                              : 'cancelled'
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <ul className='space-y-1 text-xs'>
                          {(run.steps ?? []).map((step) => (
                            <li key={`${run.id}-${step.name}`}>
                              <span className='font-medium'>{step.name}</span>
                              {' · '}
                              {step.status === 'succeeded'
                                ? t('service.automation.succeeded')
                                : step.status === 'skipped'
                                  ? t('service.automation.skipped')
                                  : t('service.automation.failed')}
                            </li>
                          ))}
                        </ul>
                      </TableCell>
                      <TableCell className='text-xs text-destructive'>
                        {run.error ?? ''}
                      </TableCell>
                      <TableCell>{formatDateTime(run.createdAt)}</TableCell>
                      <TableCell className='text-right'>
                        <Button
                          disabled={busy === run.ticketId}
                          onClick={() => void retry(run.ticketId)}
                          size='xs'
                          variant='outline'
                        >
                          <RefreshCw aria-hidden='true' />
                          {t('service.automation.retry')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                className='m-4'
                message={t('service.automation.noRuns')}
              />
            )
          ) : null}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
