import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { AttachmentField } from '@/components/procurement/attachment-field';
import {
  ErrorLine,
  LoadingLine,
  ProcurementCard,
  ProcurementPage,
} from '@/components/procurement/page-shell';
import { StatusBadge } from '@/components/procurement/status-badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatMoney,
  useLoaded,
  useProcurementApi,
} from '@/lib/procurement-api';

export default function RequestDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useProcurementApi();
  const { id } = useParams<{ id: string }>();
  const requestId = Number(id);
  const loader = useCallback(() => api.getRequest(requestId), [api, requestId]);
  const { data: request, loading, error, reload } = useLoaded(loader);

  return (
    <ProcurementPage
      title={t('procurement.requestDetail.title', { id })}
      actions={
        <Button variant='outline' render={<Link to='/procurement/requests' />}>
          {t('procurement.requestDetail.back')}
        </Button>
      }
    >
      {loading ? <LoadingLine /> : null}
      {error ? <ErrorLine message={error} /> : null}
      {request ? (
        <>
          <ProcurementCard>
            <dl className='grid gap-3 text-sm sm:grid-cols-2'>
              <div>
                <dt className='text-muted-foreground'>
                  {t('procurement.requests.applicant')}
                </dt>
                <dd>{request.applicantName ?? request.applicantId}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground'>
                  {t('procurement.requests.department')}
                </dt>
                <dd>{request.department ?? '—'}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground'>
                  {t('procurement.requests.expectedDate')}
                </dt>
                <dd>{request.expectedDate ?? '—'}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground'>
                  {t('procurement.requestStatus.label')}
                </dt>
                <dd>
                  <StatusBadge kind='request' status={request.status} />
                </dd>
              </div>
              <div className='sm:col-span-2'>
                <dt className='text-muted-foreground'>
                  {t('procurement.requests.description')}
                </dt>
                <dd>{request.description ?? '—'}</dd>
              </div>
              {request.status === 'rejected' && request.rejectReason ? (
                <div className='sm:col-span-2'>
                  <dt className='text-muted-foreground'>
                    {t('procurement.requestDetail.rejectReason')}
                  </dt>
                  <dd className='text-destructive'>{request.rejectReason}</dd>
                </div>
              ) : null}
            </dl>
          </ProcurementCard>

          <ProcurementCard title={t('procurement.requests.items')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t('procurement.requests.materialName')}
                  </TableHead>
                  <TableHead>
                    {t('procurement.requests.specification')}
                  </TableHead>
                  <TableHead>{t('procurement.requests.quantity')}</TableHead>
                  <TableHead>{t('procurement.requests.unitPrice')}</TableHead>
                  <TableHead>{t('procurement.requests.amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {request.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.materialName}</TableCell>
                    <TableCell className='text-muted-foreground'>
                      {item.specification ?? '—'}
                    </TableCell>
                    <TableCell className='tabular-nums'>
                      {item.quantity}
                    </TableCell>
                    <TableCell className='tabular-nums'>
                      {formatMoney(item.unitPrice)}
                    </TableCell>
                    <TableCell className='tabular-nums'>
                      {formatMoney(item.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className='text-right text-sm font-medium'>
              {t('procurement.requests.total')}:{' '}
              <span className='tabular-nums'>
                {formatMoney(request.totalAmount)}
              </span>
            </p>
          </ProcurementCard>

          <ProcurementCard title={t('procurement.files')}>
            <AttachmentField
              ownerType='request'
              ownerId={request.id}
              files={request.files}
              onUploaded={reload}
            />
          </ProcurementCard>
        </>
      ) : null}
    </ProcurementPage>
  );
}
