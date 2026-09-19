import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { DeliveryQueryState } from '@/components/delivery/query-state';
import { DeliveryStatusBadge } from '@/components/delivery/status-badge';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { deliveryApi } from '@/lib/delivery';
import { useDeliveryAction, useDeliveryQuery } from '@/lib/use-delivery-query';

const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;

export default function MyTasksPage(): ReactElement {
  const { t } = useTranslation();
  const query = useDeliveryQuery('my-tasks', (api) =>
    deliveryApi.tasks(api, { mine: true }),
  );
  const action = useDeliveryAction();

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('delivery.myTasks.title')}
        description={t('delivery.myTasks.description')}
      />
      {action.error ? (
        <Alert variant='destructive'>
          <AlertDescription>{action.error}</AlertDescription>
        </Alert>
      ) : null}
      <DeliveryQueryState
        error={query.error}
        loading={query.loading}
        onRetry={query.reload}
      >
        {query.data ? (
          query.data.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('delivery.field.task')}</TableHead>
                  <TableHead>{t('delivery.field.priority')}</TableHead>
                  <TableHead>{t('delivery.field.planDate')}</TableHead>
                  <TableHead>{t('delivery.field.status')}</TableHead>
                  <TableHead>{t('delivery.field.updateStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Link
                        className='text-primary underline-offset-4 hover:underline'
                        to={`/tasks/${task.id}`}
                      >
                        {task.title}
                      </Link>
                      {task.overdue ? (
                        <span className='ml-2 text-xs text-destructive'>
                          {t('delivery.tasks.overdue')}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <DeliveryStatusBadge
                        kind='priority'
                        value={task.priority}
                      />
                    </TableCell>
                    <TableCell>{task.planDate ?? '-'}</TableCell>
                    <TableCell>
                      <DeliveryStatusBadge kind='task' value={task.status} />
                    </TableCell>
                    <TableCell>
                      <NativeSelect
                        aria-label={`${t('delivery.field.updateStatus')} ${task.title}`}
                        disabled={action.pending}
                        onChange={(event) =>
                          void action
                            .run((api) =>
                              deliveryApi.updateTask(api, task.id, {
                                status: event.target.value,
                              }),
                            )
                            .then((ok) => ok && query.reload())
                        }
                        value={task.status}
                      >
                        {TASK_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {t(`delivery.status.task.${status}`)}
                          </option>
                        ))}
                      </NativeSelect>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t('delivery.myTasks.empty')}
            </p>
          )
        ) : null}
      </DeliveryQueryState>
    </PageContainer>
  );
}
