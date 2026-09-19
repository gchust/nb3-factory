import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorNotice,
  Section,
} from '@/components/sales/ui';
import { Loading } from '@/components/loading';
import {
  STAGES,
  formatAmount,
  formatDate,
  useLoad,
  useSalesApi,
  type DashboardData,
} from '@/lib/sales';

export default function DashboardPage(): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const state = useLoad('dashboard', () =>
    api.dashboard().then((response) => response.data),
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.dashboard.title')}
        description={t('sales.dashboard.description')}
      />
      {state.error ? <ErrorNotice message={state.error} /> : null}
      {state.loading && !state.data ? (
        <Loading label={t('status.loadingPage')} />
      ) : state.data ? (
        <DashboardContent data={state.data} />
      ) : null}
    </PageContainer>
  );
}

function DashboardContent({
  data,
}: {
  readonly data: DashboardData;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='space-y-6'>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <Metric
          icon={<Users className='size-4' />}
          label={t('sales.dashboard.customerCount')}
          value={String(data.customerCount)}
        />
        <Metric
          icon={<TrendingUp className='size-4' />}
          label={t('sales.dashboard.openAmount')}
          value={formatAmount(data.openOpportunityAmount)}
          hint={t('sales.dashboard.openCount', {
            count: data.openOpportunityCount,
          })}
        />
        <Metric
          icon={<AlertTriangle className='size-4' />}
          label={t('sales.dashboard.overdue')}
          value={String(data.followUp.overdue)}
          tone='danger'
        />
        <Metric
          icon={<CalendarClock className='size-4' />}
          label={t('sales.dashboard.dueToday')}
          value={String(data.followUp.today)}
          tone='warning'
          hint={t('sales.dashboard.upcoming', {
            count: data.followUp.upcoming,
          })}
        />
      </div>

      <Section title={t('sales.dashboard.stageTitle')}>
        <DataTable
          headers={[
            t('sales.fields.stage'),
            t('sales.dashboard.stageCount'),
            t('sales.dashboard.stageAmount'),
          ]}
        >
          {STAGES.map((stage) => {
            const row = data.stageCounts.find((item) => item.stage === stage);
            return (
              <tr key={stage} className='border-b border-border last:border-0'>
                <td className='px-3 py-2'>
                  <Badge tone={stageTone(stage)}>
                    {t(`sales.stage.${stage}`)}
                  </Badge>
                </td>
                <td className='px-3 py-2'>{row?.count ?? 0}</td>
                <td className='px-3 py-2'>{formatAmount(row?.amount ?? 0)}</td>
              </tr>
            );
          })}
        </DataTable>
      </Section>

      <Section title={t('sales.dashboard.needsFollowUp')}>
        {data.customersNeedingFollowUp.length === 0 ? (
          <EmptyState>{t('sales.dashboard.noFollowUp')}</EmptyState>
        ) : (
          <ul className='divide-y divide-border rounded-lg border border-border'>
            {data.customersNeedingFollowUp.map((item) => (
              <li
                key={item.customerId}
                className='flex flex-wrap items-center justify-between gap-2 px-3 py-2'
              >
                <Link
                  to={`/customers/${item.customerId}`}
                  className='text-sm font-medium text-primary hover:underline'
                >
                  {item.customerName ?? item.customerId}
                </Link>
                <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                  <CalendarDays className='size-3.5' />
                  {formatDate(item.nextFollowUpAt)}
                  <Badge
                    tone={item.dueState === 'overdue' ? 'danger' : 'warning'}
                  >
                    {t(`sales.due.${item.dueState}`)}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  readonly icon: ReactElement;
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly tone?: 'danger' | 'warning';
}): ReactElement {
  return (
    <div className='rounded-xl border border-border bg-background p-4'>
      <div className='flex items-center gap-2 text-xs text-muted-foreground'>
        {icon}
        {label}
      </div>
      <div
        className={
          tone === 'danger'
            ? 'mt-2 text-2xl font-semibold text-destructive'
            : tone === 'warning'
              ? 'mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-400'
              : 'mt-2 text-2xl font-semibold'
        }
      >
        {value}
      </div>
      {hint ? (
        <div className='mt-1 text-xs text-muted-foreground'>{hint}</div>
      ) : null}
    </div>
  );
}

function stageTone(stage: string): string {
  if (stage === 'won') return 'success';
  if (stage === 'lost') return 'danger';
  if (stage === 'negotiation' || stage === 'proposal') return 'info';
  return 'neutral';
}
