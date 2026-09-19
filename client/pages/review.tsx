import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { DeliveryQueryState } from '@/components/delivery/query-state';
import { DeliveryStatusBadge } from '@/components/delivery/status-badge';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
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

export default function ReviewPage(): ReactElement {
  const { t } = useTranslation();
  const query = useDeliveryQuery('review', (api) =>
    deliveryApi.submissions(api, 'review'),
  );

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('delivery.review.title')}
        description={t('delivery.review.description')}
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
                  <TableHead>{t('delivery.field.milestone')}</TableHead>
                  <TableHead>{t('delivery.field.applicant')}</TableHead>
                  <TableHead>{t('delivery.submissions.roundLabel')}</TableHead>
                  <TableHead>{t('delivery.field.status')}</TableHead>
                  <TableHead>{t('delivery.field.createdAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell>{submission.projectName}</TableCell>
                    <TableCell>
                      <Link
                        className='text-primary underline-offset-4 hover:underline'
                        to={`/submissions/${submission.id}`}
                      >
                        {submission.milestoneName}
                      </Link>
                    </TableCell>
                    <TableCell>{submission.applicantName}</TableCell>
                    <TableCell>
                      {t('delivery.submissions.round', {
                        round: submission.round,
                      })}
                    </TableCell>
                    <TableCell>
                      <DeliveryStatusBadge
                        kind='submission'
                        value={submission.status}
                      />
                    </TableCell>
                    <TableCell className='text-xs text-muted-foreground'>
                      {formatDateTime(submission.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t('delivery.review.empty')}
            </p>
          )
        ) : null}
      </DeliveryQueryState>
    </PageContainer>
  );
}
