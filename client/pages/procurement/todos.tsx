import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  approveOrder,
  errorCode,
  getOrder,
  listTodoOrders,
  rejectOrder,
  type Order,
} from '@/components/procurement/api.js';
import {
  formatAmount,
  formatCurrency,
  formatDateTime,
  formatQuantity,
} from '@/components/procurement/format.js';
import {
  EmptyState,
  ErrorBanner,
  Field,
  Table,
  TD,
  TH,
  THead,
  TR,
} from '@/components/procurement/ui.js';
import { useAsyncData } from '@/components/procurement/use-async-data.js';

export default function ProcurementTodosPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsyncData(
    () => listTodoOrders(api),
    [api],
  );
  const [reviewId, setReviewId] = useState<number | null>(null);

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        description={t('procurement.todos.description')}
        title={t('procurement.todos.title')}
      />
      <ErrorBanner message={error ? t('procurement.todos.loadFailed') : null} />
      {loading && !data ? (
        <Loading />
      ) : (data ?? []).length === 0 ? (
        <EmptyState message={t('procurement.todos.empty')} />
      ) : (
        <Table>
          <THead>
            <TH>{t('procurement.orders.orderNo')}</TH>
            <TH>{t('procurement.orders.supplier')}</TH>
            <TH>{t('procurement.orders.buyer')}</TH>
            <TH className='text-right'>{t('procurement.orders.amount')}</TH>
            <TH>{t('procurement.todos.submittedAt')}</TH>
            <TH className='text-right'>{t('procurement.actions')}</TH>
          </THead>
          <tbody>
            {(data ?? []).map((order) => (
              <TR key={order.id}>
                <TD className='font-mono text-xs'>{order.orderNo}</TD>
                <TD>{order.supplierName ?? '—'}</TD>
                <TD>{order.buyerName ?? '—'}</TD>
                <TD className='text-right tabular-nums'>
                  {formatCurrency(order.totalAmount)}
                </TD>
                <TD>{formatDateTime(order.submittedAt)}</TD>
                <TD className='text-right'>
                  <Button
                    onClick={() => setReviewId(order.id)}
                    size='xs'
                    type='button'
                  >
                    {t('procurement.todos.review')}
                  </Button>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {reviewId !== null ? (
        <ReviewDialog
          key={reviewId}
          onClose={() => setReviewId(null)}
          onReviewed={() => {
            setReviewId(null);
            reload();
          }}
          orderId={reviewId}
        />
      ) : null}
    </PageContainer>
  );
}

function ReviewDialog({
  orderId,
  onClose,
  onReviewed,
}: {
  orderId: number;
  onClose: () => void;
  onReviewed: () => void;
}): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const [order, setOrder] = useState<Order | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    getOrder(api, orderId)
      .then((data) => {
        if (!cancelled) setOrder(data);
      })
      .catch(() => {
        if (!cancelled) setError(t('procurement.todos.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, api, t]);

  const act = async (action: 'approve' | 'reject'): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (action === 'approve') {
        await approveOrder(api, orderId);
      } else {
        await rejectOrder(api, orderId, reason);
      }
      onReviewed();
    } catch (cause) {
      setError(todoErrorMessage(t, errorCode(cause)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
    >
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle className='font-mono'>
            {order?.orderNo ?? t('procurement.todos.review')}
          </DialogTitle>
          <DialogDescription>
            {t('procurement.todos.reviewDescription')}
          </DialogDescription>
        </DialogHeader>
        {order ? (
          <div className='max-h-[65vh] space-y-3 overflow-auto pr-1'>
            <ErrorBanner message={error} />
            <dl className='grid gap-2 text-sm sm:grid-cols-3'>
              <div>
                <dt className='text-xs text-muted-foreground'>
                  {t('procurement.orders.supplier')}
                </dt>
                <dd>{order.supplierName ?? '—'}</dd>
              </div>
              <div>
                <dt className='text-xs text-muted-foreground'>
                  {t('procurement.orders.buyer')}
                </dt>
                <dd>{order.buyerName ?? '—'}</dd>
              </div>
              <div>
                <dt className='text-xs text-muted-foreground'>
                  {t('procurement.orders.total')}
                </dt>
                <dd className='tabular-nums'>
                  {formatCurrency(order.totalAmount)}
                </dd>
              </div>
            </dl>
            <Table>
              <THead>
                <TH>{t('procurement.orders.material')}</TH>
                <TH className='text-right'>
                  {t('procurement.orders.quantity')}
                </TH>
                <TH className='text-right'>
                  {t('procurement.orders.unitPrice')}
                </TH>
                <TH className='text-right'>
                  {t('procurement.orders.itemAmount')}
                </TH>
              </THead>
              <tbody>
                {(order.items ?? []).map((item) => (
                  <TR key={item.id}>
                    <TD>
                      {item.materialCode} {item.materialName}
                    </TD>
                    <TD className='text-right tabular-nums'>
                      {formatQuantity(item.quantity)} {item.unit}
                    </TD>
                    <TD className='text-right tabular-nums'>
                      {formatAmount(item.unitPrice)}
                    </TD>
                    <TD className='text-right tabular-nums'>
                      {formatAmount(item.amount)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Field label={t('procurement.orders.rejectReason')}>
              <Input
                onChange={(event) => setReason(event.currentTarget.value)}
                placeholder={t('procurement.todos.rejectPlaceholder')}
                value={reason}
              />
            </Field>
          </div>
        ) : error ? (
          <ErrorBanner message={error} />
        ) : (
          <Loading />
        )}
        <DialogFooter>
          <Button onClick={onClose} type='button' variant='outline'>
            {t('actions.cancel')}
          </Button>
          <Button
            disabled={busy || reason.trim() === ''}
            onClick={() => {
              void act('reject');
            }}
            type='button'
            variant='destructive'
          >
            {t('procurement.orders.reject')}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              void act('approve');
            }}
            type='button'
          >
            {t('procurement.orders.approve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function todoErrorMessage(
  t: (key: string) => string,
  code: string | undefined,
): string {
  if (code === 'ORDER_SELF_APPROVAL') {
    return t('procurement.orders.selfApproval');
  }
  if (code === 'ORDER_NOT_REVIEWABLE') {
    return t('procurement.orders.notReviewable');
  }
  if (code === 'FORBIDDEN' || code === 'UNAUTHORIZED') {
    return t('procurement.forbidden');
  }
  return t('procurement.saveFailed');
}
