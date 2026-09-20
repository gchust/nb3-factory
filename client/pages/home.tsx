import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangle,
  BadgeCheck,
  ClipboardCheck,
  FileWarning,
  Wallet,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatDate, formatMoney } from '@/lib/format';
import { useResource } from '@/lib/use-delivery-resource';

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const state = useResource((api) => api.dashboard());

  if (state.loading) {
    return (
      <PageContainer>
        <Loading />
      </PageContainer>
    );
  }

  if (state.error || !state.data) {
    return (
      <PageContainer>
        <Card>
          <CardHeader>
            <CardTitle>{t('delivery.dashboard.loadFailed')}</CardTitle>
            <CardDescription>{state.error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={state.reload}>{t('delivery.common.retry')}</Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  const { cards, pendingReview, overdueMilestones, contracts } = state.data;
  const progress =
    cards.totalMilestones > 0
      ? Math.round((cards.acceptedMilestones / cards.totalMilestones) * 100)
      : 0;

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('delivery.dashboard.title')}
        description={t('delivery.dashboard.description')}
      />

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <StatCard
          title={t('delivery.dashboard.pendingReview')}
          value={String(cards.pendingReview)}
          icon={<ClipboardCheck aria-hidden='true' />}
          to='acceptance'
          hint={t('delivery.dashboard.openQueue')}
        />
        <StatCard
          title={t('delivery.dashboard.overdue')}
          value={String(cards.overdueMilestones)}
          icon={<AlertTriangle aria-hidden='true' />}
          to='contracts'
          hint={t('delivery.dashboard.openContracts')}
        />
        <StatCard
          title={t('delivery.dashboard.progress')}
          value={`${progress}%`}
          icon={<BadgeCheck aria-hidden='true' />}
          to='contracts'
          hint={t('delivery.dashboard.progressHint', {
            accepted: cards.acceptedMilestones,
            total: cards.totalMilestones,
          })}
        />
        <StatCard
          title={t('delivery.dashboard.outstanding')}
          value={formatMoney(cards.outstandingCents)}
          icon={<Wallet aria-hidden='true' />}
          to='receivables'
          hint={t('delivery.dashboard.openReceivables')}
        />
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>{t('delivery.dashboard.pendingList')}</CardTitle>
            <CardDescription>
              {t('delivery.dashboard.pendingListHint')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {pendingReview.length ? (
              pendingReview.map((item) => (
                <Link
                  key={item.versionId}
                  className='flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted'
                  to={`acceptance?version=${item.versionId}`}
                >
                  <div className='min-w-0'>
                    <p className='truncate font-medium'>
                      {item.contractNo} · {item.deliverableName} V
                      {item.versionNo}
                    </p>
                    <p className='text-sm text-muted-foreground'>
                      {item.milestoneName} · {item.submittedByName} ·{' '}
                      {formatDate(item.submittedAt)}
                    </p>
                  </div>
                  <StatusBadge kind='version' status='pending_review' />
                </Link>
              ))
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t('delivery.dashboard.noPending')}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('delivery.dashboard.overdueList')}</CardTitle>
            <CardDescription>
              {t('delivery.dashboard.overdueListHint')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {overdueMilestones.length ? (
              overdueMilestones.map((item) => (
                <Link
                  key={item.id}
                  className='flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted'
                  to={`contracts/${item.contractId}`}
                >
                  <div className='min-w-0'>
                    <p className='truncate font-medium'>
                      {item.contractNo} · {item.name}
                    </p>
                    <p className='flex items-center gap-1 text-sm text-muted-foreground'>
                      <FileWarning aria-hidden='true' className='size-4' />
                      {t('delivery.dashboard.due', {
                        date: formatDate(item.dueDate),
                      })}{' '}
                      · {formatMoney(item.amountCents)}
                    </p>
                  </div>
                  <StatusBadge kind='milestone' status={item.status} />
                </Link>
              ))
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t('delivery.dashboard.noOverdue')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('delivery.dashboard.progressList')}</CardTitle>
          <CardDescription>
            {t('delivery.dashboard.progressListHint')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {contracts.length ? (
            contracts.map((contract) => (
              <Link
                key={contract.id}
                className='block space-y-2 rounded-md border border-border p-3 transition-colors hover:bg-muted'
                to={`contracts/${contract.id}`}
              >
                <div className='flex items-center justify-between gap-3'>
                  <p className='truncate font-medium'>
                    {contract.contractNo} · {contract.title}
                  </p>
                  <StatusBadge kind='contract' status={contract.status} />
                </div>
                <Progress value={contract.progressPercent} />
                <p className='text-sm text-muted-foreground'>
                  {t('delivery.dashboard.progressHint', {
                    accepted: contract.acceptedMilestoneCount,
                    total: contract.milestoneCount,
                  })}{' '}
                  · {formatMoney(contract.amountCents)} · {contract.managerName}{' '}
                  · {t('delivery.contracts.endDate')}:{' '}
                  {formatDate(contract.endDate)}
                </p>
              </Link>
            ))
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t('delivery.dashboard.noContracts')}
            </p>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function StatCard({
  title,
  value,
  icon,
  hint,
  to,
}: {
  readonly title: string;
  readonly value: string;
  readonly icon: ReactNode;
  readonly hint: string;
  readonly to: string;
}): ReactElement {
  return (
    <Link to={to} className='block'>
      <Card className='h-full transition-colors hover:bg-muted'>
        <CardHeader>
          <CardDescription className='flex items-center gap-2'>
            {icon}
            {title}
          </CardDescription>
          <CardTitle className='text-2xl'>{value}</CardTitle>
        </CardHeader>
        <CardContent className='text-sm text-muted-foreground'>
          {hint}
        </CardContent>
      </Card>
    </Link>
  );
}
