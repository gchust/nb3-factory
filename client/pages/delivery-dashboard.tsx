import { useTranslation } from '@nocobase/i18n/client';
import { RefreshCw } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  DeliveryEmpty,
  DeliveryError,
  DeliveryHeader,
  DeliveryLoading,
  StatusBadge,
} from '@/components/delivery/ui';
import { formatDate, formatRate } from '@/components/delivery/format';
import { useAsyncData } from '@/components/delivery/use-async-data';
import { useDeliveryApi } from '@/components/delivery/delivery-api';

export default function DeliveryDashboardPage(): ReactElement {
  const { t } = useTranslation();
  const api = useDeliveryApi();
  const { data, error, loading, reload } = useAsyncData(
    () => api.dashboard(),
    [api],
  );

  return (
    <section className='space-y-6 p-6'>
      <DeliveryHeader
        title={t('delivery.dashboard.title')}
        description={t('delivery.dashboard.description')}
        actions={
          <Button variant='outline' size='sm' onClick={reload}>
            <RefreshCw aria-hidden='true' />
            {t('delivery.actions.refresh')}
          </Button>
        }
      />
      {loading ? <DeliveryLoading /> : null}
      {error ? <DeliveryError error={error} onRetry={reload} /> : null}
      {data ? (
        <div className='space-y-6'>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            <StatCard
              label={t('delivery.dashboard.totalHours')}
              value={String(data.totalHours)}
            />
            <StatCard
              label={t('delivery.dashboard.projectCount')}
              value={String(data.projects.length)}
            />
            <StatCard
              label={t('delivery.dashboard.overdueCount')}
              value={String(data.overdueTasks.length)}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t('delivery.dashboard.byProject')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('delivery.fields.project')}</TableHead>
                    <TableHead>{t('delivery.fields.client')}</TableHead>
                    <TableHead>{t('delivery.dashboard.hours')}</TableHead>
                    <TableHead>{t('delivery.dashboard.tasks')}</TableHead>
                    <TableHead>
                      {t('delivery.dashboard.completionRate')}
                    </TableHead>
                    <TableHead>
                      {t('delivery.dashboard.overdueCount')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.projects.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell className='font-medium'>
                        {project.name}
                      </TableCell>
                      <TableCell>{project.clientName}</TableCell>
                      <TableCell>{project.hours}</TableCell>
                      <TableCell>
                        {project.completedTaskCount}/{project.taskCount}
                      </TableCell>
                      <TableCell>
                        {formatRate(project.completionRate)}
                      </TableCell>
                      <TableCell>{project.overdueCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {data.projects.length === 0 ? (
                <DeliveryEmpty>{t('delivery.dashboard.noData')}</DeliveryEmpty>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('delivery.dashboard.overdueTasks')}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.overdueTasks.length === 0 ? (
                <DeliveryEmpty>
                  {t('delivery.dashboard.noOverdue')}
                </DeliveryEmpty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('delivery.fields.task')}</TableHead>
                      <TableHead>{t('delivery.fields.project')}</TableHead>
                      <TableHead>{t('delivery.fields.assignee')}</TableHead>
                      <TableHead>{t('delivery.fields.plannedDate')}</TableHead>
                      <TableHead>{t('delivery.fields.actualDate')}</TableHead>
                      <TableHead>
                        {t('delivery.status.task.completed')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.overdueTasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className='font-medium'>
                          {task.name}
                        </TableCell>
                        <TableCell>{task.projectName ?? '—'}</TableCell>
                        <TableCell>{task.assigneeName ?? '—'}</TableCell>
                        <TableCell>{formatDate(task.plannedDate)}</TableCell>
                        <TableCell>{formatDate(task.actualDate)}</TableCell>
                        <TableCell>
                          <StatusBadge
                            value={t('delivery.timeliness.overdue')}
                            tone='warning'
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </section>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent className='text-2xl font-semibold'>{value}</CardContent>
    </Card>
  );
}
