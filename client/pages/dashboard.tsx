import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import {
  EmptyState,
  EnumBadge,
  ErrorState,
  LoadingState,
  PageHeader,
  PageSection,
  Panel,
} from '@/components/recruiting/ui';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { loadDashboard } from '@/lib/recruiting-api';
import { useAsyncData } from '@/lib/recruiting-hooks';

export default function DashboardPage(): ReactElement {
  const { t } = useTranslation();
  const client = useService(apiClientToken);
  const dashboard = useAsyncData(() => loadDashboard(client), []);

  return (
    <PageSection>
      <PageHeader
        title={t('recruiting.dashboard.title')}
        description={t('recruiting.dashboard.description')}
      />

      {dashboard.status === 'loading' ? (
        <LoadingState label={t('recruiting.state.loading')} />
      ) : null}
      {dashboard.status === 'error' ? (
        <ErrorState
          message={dashboard.message ?? t('recruiting.state.error')}
          onRetry={dashboard.reload}
        />
      ) : null}

      {dashboard.status === 'ready' && dashboard.data ? (
        <>
          <div className='grid gap-4 sm:grid-cols-3'>
            <Metric
              label={t('recruiting.dashboard.openRequisitions')}
              value={dashboard.data.totals.openRequisitions}
            />
            <Metric
              label={t('recruiting.dashboard.scheduledInterviews')}
              value={dashboard.data.totals.scheduledInterviews}
            />
            <Metric
              label={t('recruiting.dashboard.totalCandidates')}
              value={dashboard.data.totals.totalCandidates}
            />
          </div>

          <Panel title={t('recruiting.dashboard.byRequisition')}>
            {dashboard.data.requisitions.length === 0 ? (
              <EmptyState label={t('recruiting.dashboard.empty')} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('recruiting.fields.title')}</TableHead>
                    <TableHead>{t('recruiting.fields.department')}</TableHead>
                    <TableHead>{t('recruiting.fields.status')}</TableHead>
                    <TableHead>{t('recruiting.fields.headcount')}</TableHead>
                    <TableHead>{t('recruiting.dashboard.stages')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.data.requisitions.map((requisition) => (
                    <TableRow key={requisition.id}>
                      <TableCell className='font-medium'>
                        {requisition.title}
                      </TableCell>
                      <TableCell>{requisition.department}</TableCell>
                      <TableCell>
                        <EnumBadge
                          kind='requisitionStatus'
                          value={requisition.status}
                        />
                      </TableCell>
                      <TableCell className='tabular-nums'>
                        {requisition.headcount}
                      </TableCell>
                      <TableCell>
                        <div className='flex flex-wrap gap-1.5'>
                          {dashboard.data?.stageKeys.map((stage) => (
                            <Badge
                              key={stage}
                              variant='outline'
                              className='gap-1 font-normal'
                            >
                              <EnumBadgeLabel kind='stage' value={stage} />
                              <span className='tabular-nums'>
                                {requisition.stages[stage] ?? 0}
                              </span>
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>

          {dashboard.data.unassignedCandidates > 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('recruiting.dashboard.unassigned', {
                count: dashboard.data.unassignedCandidates,
              })}
            </p>
          ) : null}
        </>
      ) : null}
    </PageSection>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}): ReactElement {
  return (
    <div className='rounded-xl border border-border bg-card p-4'>
      <p className='text-sm text-muted-foreground'>{label}</p>
      <p className='font-heading text-3xl font-semibold tabular-nums'>
        {value}
      </p>
    </div>
  );
}

function EnumBadgeLabel({
  kind,
  value,
}: {
  kind: string;
  value: string;
}): ReactElement {
  const { t } = useTranslation();
  return <>{t(`recruiting.enums.${kind}.${value}`, { defaultValue: value })}</>;
}
