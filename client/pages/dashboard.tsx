import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { DeliveryStatusBadge } from '@/components/delivery/status-badge';
import { DeliveryQueryState } from '@/components/delivery/query-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { deliveryApi, formatDateTime } from '@/lib/delivery';
import { useDeliveryQuery } from '@/lib/use-delivery-query';

export default function DashboardPage(): ReactElement {
  const { t } = useTranslation();
  const query = useDeliveryQuery('dashboard', (api) =>
    deliveryApi.dashboard(api),
  );
  const data = query.data;

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('delivery.dashboard.title')}
        description={t('delivery.dashboard.description')}
      />
      <DeliveryQueryState
        error={query.error}
        loading={query.loading}
        onRetry={query.reload}
      >
        {data ? (
          <div className='space-y-6'>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              <StatCard
                icon={<FolderKanban className='size-4' />}
                label={t('delivery.dashboard.projectCount')}
                value={data.projectCount}
              />
              <StatCard
                icon={<CheckCircle2 className='size-4' />}
                label={t('delivery.dashboard.milestoneRate')}
                value={`${Math.round(data.milestoneCompletionRate * 100)}%`}
                hint={t('delivery.dashboard.milestoneRateHint', {
                  done: data.milestonesCompleted,
                  total: data.milestoneCount,
                })}
              />
              <StatCard
                icon={<AlertTriangle className='size-4' />}
                label={t('delivery.dashboard.overdueCount')}
                value={data.overdueTaskCount}
              />
              <StatCard
                icon={<ClipboardList className='size-4' />}
                label={t('delivery.dashboard.pendingReviewCount')}
                value={data.pendingReviewCount}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t('delivery.dashboard.overdueTasks')}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.overdueTasks.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('delivery.field.task')}</TableHead>
                        <TableHead>{t('delivery.field.project')}</TableHead>
                        <TableHead>{t('delivery.field.milestone')}</TableHead>
                        <TableHead>{t('delivery.field.assignee')}</TableHead>
                        <TableHead>{t('delivery.field.planDate')}</TableHead>
                        <TableHead>{t('delivery.field.status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.overdueTasks.map((task) => (
                        <TableRow key={task.id}>
                          <TableCell>
                            <Link
                              className='text-primary underline-offset-4 hover:underline'
                              to={`/tasks/${task.id}`}
                            >
                              {task.title}
                            </Link>
                          </TableCell>
                          <TableCell>{task.projectName}</TableCell>
                          <TableCell>{task.milestoneName}</TableCell>
                          <TableCell>{task.assigneeName ?? '-'}</TableCell>
                          <TableCell>{task.planDate ?? '-'}</TableCell>
                          <TableCell>
                            <DeliveryStatusBadge
                              kind='task'
                              value={task.status}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    {t('delivery.dashboard.noOverdue')}
                  </p>
                )}
              </CardContent>
            </Card>

            <div className='grid gap-6 lg:grid-cols-2'>
              <Card>
                <CardHeader>
                  <CardTitle>{t('delivery.dashboard.myTasks')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.myTasks.length ? (
                    <ul className='space-y-2'>
                      {data.myTasks.map((task) => (
                        <li
                          className='flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2'
                          key={task.id}
                        >
                          <Link
                            className='min-w-0 flex-1 truncate text-sm text-primary underline-offset-4 hover:underline'
                            to={`/tasks/${task.id}`}
                          >
                            {task.title}
                          </Link>
                          <span className='text-xs text-muted-foreground'>
                            {task.planDate ?? '-'}
                          </span>
                          <DeliveryStatusBadge
                            kind='task'
                            value={task.status}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className='text-sm text-muted-foreground'>
                      {t('delivery.dashboard.noMyTasks')}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    {t('delivery.dashboard.pendingReviews')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.pendingReviews.length ? (
                    <ul className='space-y-2'>
                      {data.pendingReviews.map((submission) => (
                        <li
                          className='flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2'
                          key={submission.id}
                        >
                          <Link
                            className='text-sm text-primary underline-offset-4 hover:underline'
                            to={`/submissions/${submission.id}`}
                          >
                            {t('delivery.dashboard.reviewItem', {
                              round: submission.round,
                              applicant: submission.applicantName,
                            })}
                          </Link>
                          <span className='text-xs text-muted-foreground'>
                            {formatDateTime(submission.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className='text-sm text-muted-foreground'>
                      {t('delivery.dashboard.noPendingReviews')}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}
      </DeliveryQueryState>
    </PageContainer>
  );
}

interface StatCardProps {
  readonly icon: ReactElement;
  readonly label: string;
  readonly value: number | string;
  readonly hint?: string;
}

function StatCard({ icon, label, value, hint }: StatCardProps): ReactElement {
  return (
    <Card size='sm'>
      <CardContent className='space-y-1 py-2'>
        <div className='flex items-center gap-2 text-muted-foreground'>
          {icon}
          <span className='text-xs'>{label}</span>
        </div>
        <p className='font-heading text-2xl font-semibold'>{value}</p>
        {hint ? <p className='text-xs text-muted-foreground'>{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
