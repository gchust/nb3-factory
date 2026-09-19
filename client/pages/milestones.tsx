import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { DeliveryQueryState } from '@/components/delivery/query-state';
import { DeliveryStatusBadge } from '@/components/delivery/status-badge';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { deliveryApi } from '@/lib/delivery';
import { useDeliveryQuery } from '@/lib/use-delivery-query';

export default function MilestonesPage(): ReactElement {
  const { t } = useTranslation();
  const query = useDeliveryQuery('milestones', (api) =>
    deliveryApi.milestones(api),
  );

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('delivery.milestones.listTitle')}
        description={t('delivery.milestones.listDescription')}
      />
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
                  <TableHead>{t('delivery.field.project')}</TableHead>
                  <TableHead>{t('delivery.field.name')}</TableHead>
                  <TableHead>{t('delivery.field.dueDate')}</TableHead>
                  <TableHead>{t('delivery.field.status')}</TableHead>
                  <TableHead>{t('delivery.field.progress')}</TableHead>
                  <TableHead>{t('delivery.field.submission')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((milestone) => (
                  <TableRow key={milestone.id}>
                    <TableCell className='text-xs text-muted-foreground'>
                      {milestone.projectCode} · {milestone.projectName}
                    </TableCell>
                    <TableCell>
                      <Link
                        className='text-primary underline-offset-4 hover:underline'
                        to={`/milestones/${milestone.id}`}
                      >
                        {milestone.name}
                      </Link>
                    </TableCell>
                    <TableCell>{milestone.dueDate ?? '-'}</TableCell>
                    <TableCell>
                      <DeliveryStatusBadge
                        kind='milestone'
                        value={milestone.status}
                      />
                    </TableCell>
                    <TableCell>
                      <div className='flex items-center gap-2'>
                        <Progress
                          className='w-24'
                          value={Math.round(milestone.progress * 100)}
                        />
                        <span className='text-xs text-muted-foreground'>
                          {milestone.doneCount}/{milestone.taskCount}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {milestone.submission ? (
                        <DeliveryStatusBadge
                          kind='submission'
                          value={milestone.submission.status}
                        />
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t('delivery.milestones.empty')}
            </p>
          )
        ) : null}
      </DeliveryQueryState>
    </PageContainer>
  );
}
