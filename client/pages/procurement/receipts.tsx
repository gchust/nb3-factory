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
import { AttachmentPanel } from '@/components/procurement/attachment-panel.js';
import {
  createReceipt,
  errorCode,
  errorDetails,
  getOrder,
  getPrincipal,
  listOrders,
  listReceipts,
  type Order,
  type Receipt,
} from '@/components/procurement/api.js';
import {
  formatDate,
  formatDateTime,
  formatQuantity,
} from '@/components/procurement/format.js';
import {
  EmptyState,
  ErrorBanner,
  Field,
  ReceiptStatusBadge,
  Table,
  TD,
  TH,
  THead,
  TR,
} from '@/components/procurement/ui.js';
import { useAsyncData } from '@/components/procurement/use-async-data.js';

export default function ProcurementReceiptsPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsyncData(
    () =>
      Promise.all([
        listReceipts(api),
        listOrders(api, { status: 'approved' }),
        getPrincipal(api),
      ]),
    [api],
  );
  const receipts = data?.[0] ?? [];
  const approvedOrders = data?.[1] ?? [];
  const principal = data?.[2];
  const [registerOrderId, setRegisterOrderId] = useState<number | null>(null);
  const [detailReceipt, setDetailReceipt] = useState<Receipt | null>(null);

  const pendingOrders = approvedOrders.filter(
    (order) => order.receiptStatus !== 'received',
  );
  const canRegister =
    principal !== undefined &&
    (principal.isAdministrator ||
      principal.roles.includes('manager') ||
      principal.roles.includes('warehouse'));

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        description={t('procurement.receipts.description')}
        title={t('procurement.receipts.title')}
      />
      <ErrorBanner
        message={error ? t('procurement.receipts.loadFailed') : null}
      />

      <section className='space-y-3'>
        <h2 className='font-heading text-lg font-medium'>
          {t('procurement.receipts.pendingTitle')}
        </h2>
        {loading && !data ? (
          <Loading />
        ) : pendingOrders.length === 0 ? (
          <EmptyState message={t('procurement.receipts.noPending')} />
        ) : (
          <Table>
            <THead>
              <TH>{t('procurement.orders.orderNo')}</TH>
              <TH>{t('procurement.orders.supplier')}</TH>
              <TH>{t('procurement.orders.receiptStatus')}</TH>
              <TH className='text-right'>{t('procurement.actions')}</TH>
            </THead>
            <tbody>
              {pendingOrders.map((order) => (
                <TR key={order.id}>
                  <TD className='font-mono text-xs'>{order.orderNo}</TD>
                  <TD>{order.supplierName ?? '—'}</TD>
                  <TD>
                    <ReceiptStatusBadge status={order.receiptStatus} />
                  </TD>
                  <TD className='text-right'>
                    {canRegister ? (
                      <Button
                        onClick={() => setRegisterOrderId(order.id)}
                        size='xs'
                        type='button'
                      >
                        {t('procurement.receipts.register')}
                      </Button>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className='space-y-3'>
        <h2 className='font-heading text-lg font-medium'>
          {t('procurement.receipts.listTitle')}
        </h2>
        {receipts.length === 0 ? (
          <EmptyState message={t('procurement.receipts.empty')} />
        ) : (
          <Table>
            <THead>
              <TH>{t('procurement.receipts.receiptNo')}</TH>
              <TH>{t('procurement.orders.orderNo')}</TH>
              <TH>{t('procurement.orders.supplier')}</TH>
              <TH>{t('procurement.receipts.receivedAt')}</TH>
              <TH>{t('procurement.receipts.receivedBy')}</TH>
              <TH className='text-right'>{t('procurement.actions')}</TH>
            </THead>
            <tbody>
              {receipts.map((receipt) => (
                <TR key={receipt.id}>
                  <TD className='font-mono text-xs'>{receipt.receiptNo}</TD>
                  <TD className='font-mono text-xs'>{receipt.orderNo}</TD>
                  <TD>{receipt.supplierName ?? '—'}</TD>
                  <TD>{formatDate(receipt.receivedAt)}</TD>
                  <TD>{receipt.receivedByName ?? '—'}</TD>
                  <TD className='text-right'>
                    <Button
                      onClick={() => setDetailReceipt(receipt)}
                      size='xs'
                      type='button'
                      variant='outline'
                    >
                      {t('procurement.receipts.detail')}
                    </Button>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      {registerOrderId !== null ? (
        <RegisterReceiptDialog
          key={registerOrderId}
          onClose={() => setRegisterOrderId(null)}
          onRegistered={(wasDuplicate) => {
            reload();
            if (!wasDuplicate) setRegisterOrderId(null);
          }}
          orderId={registerOrderId}
        />
      ) : null}

      {detailReceipt ? (
        <ReceiptDetailDialog
          key={detailReceipt.id}
          onClose={() => setDetailReceipt(null)}
          receipt={detailReceipt}
        />
      ) : null}
    </PageContainer>
  );
}

interface ReceiptRow {
  readonly orderItemId: number;
  quantity: string;
}

function RegisterReceiptDialog({
  orderId,
  onClose,
  onRegistered,
}: {
  orderId: number;
  onClose: () => void;
  onRegistered: (duplicate: boolean) => void;
}): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const [order, setOrder] = useState<Order | undefined>();
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [receivedAt, setReceivedAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [remark, setRemark] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOrder(api, orderId)
      .then((data) => {
        if (cancelled) return;
        setOrder(data);
        setRows(
          (data.items ?? []).map((item) => ({
            orderItemId: item.id,
            quantity: '',
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setError(t('procurement.receipts.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, api, t]);

  const submit = async (): Promise<void> => {
    const items = rows
      .map((row) => ({
        orderItemId: row.orderItemId,
        quantity: Number(row.quantity),
      }))
      .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0);
    if (items.length === 0) {
      setError(t('procurement.receipts.quantityRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createReceipt(api, orderId, {
        receivedAt,
        remark: remark || null,
        requestId,
        items,
      });
      if (result.duplicate) setDuplicate(true);
      onRegistered(result.duplicate);
    } catch (cause) {
      setError(receiptErrorMessage(t, cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      // Unsaved receipt quantities must survive a stray outside press; the
      // native date picker for 到货日期 counts as outside for Base UI.
      disablePointerDismissal
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
    >
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('procurement.receipts.register')}</DialogTitle>
          <DialogDescription>
            {t('procurement.receipts.registerDescription')}
          </DialogDescription>
        </DialogHeader>
        {order ? (
          <div className='max-h-[65vh] space-y-3 overflow-auto pr-1'>
            <ErrorBanner message={error} />
            {duplicate ? (
              <p className='rounded-lg border border-border bg-muted px-3 py-2 text-sm'>
                {t('procurement.receipts.duplicate')}
              </p>
            ) : null}
            <div className='grid gap-2 sm:grid-cols-2'>
              <Field label={t('procurement.receipts.receivedAt')}>
                <Input
                  aria-label={t('procurement.receipts.receivedAt')}
                  onChange={(event) => setReceivedAt(event.currentTarget.value)}
                  type='date'
                  value={receivedAt}
                />
              </Field>
              <Field label={t('procurement.receipts.remark')}>
                <Input
                  onChange={(event) => setRemark(event.currentTarget.value)}
                  value={remark}
                />
              </Field>
            </div>
            <Table>
              <THead>
                <TH>{t('procurement.orders.material')}</TH>
                <TH className='text-right'>
                  {t('procurement.receipts.ordered')}
                </TH>
                <TH className='text-right'>
                  {t('procurement.receipts.received')}
                </TH>
                <TH className='text-right'>
                  {t('procurement.receipts.remaining')}
                </TH>
                <TH className='text-right'>
                  {t('procurement.receipts.thisTime')}
                </TH>
              </THead>
              <tbody>
                {(order.items ?? []).map((item) => {
                  const row = rows.find(
                    (candidate) => candidate.orderItemId === item.id,
                  );
                  return (
                    <TR key={item.id}>
                      <TD>
                        {item.materialCode} {item.materialName}
                      </TD>
                      <TD className='text-right tabular-nums'>
                        {formatQuantity(item.quantity)} {item.unit}
                      </TD>
                      <TD className='text-right tabular-nums'>
                        {formatQuantity(item.receivedQuantity)}
                      </TD>
                      <TD className='text-right tabular-nums'>
                        {formatQuantity(item.remainingQuantity)}
                      </TD>
                      <TD className='text-right'>
                        <Input
                          aria-label={`${t('procurement.receipts.thisTime')} ${item.materialCode}`}
                          className='ml-auto w-24 text-right'
                          disabled={item.remainingQuantity <= 0}
                          min='0'
                          onChange={(event) => {
                            const quantity = event.currentTarget.value;
                            setRows((current) =>
                              current.map((candidate) =>
                                candidate.orderItemId === item.id
                                  ? { ...candidate, quantity }
                                  : candidate,
                              ),
                            );
                          }}
                          placeholder='0'
                          step='any'
                          type='number'
                          value={row?.quantity ?? ''}
                        />
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
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
            disabled={busy || !order}
            onClick={() => {
              void submit();
            }}
            type='button'
          >
            {busy ? t('procurement.saving') : t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptDetailDialog({
  receipt,
  onClose,
}: {
  receipt: Receipt;
  onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
    >
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle className='font-mono'>{receipt.receiptNo}</DialogTitle>
          <DialogDescription>
            {receipt.orderNo} · {receipt.supplierName ?? ''} ·{' '}
            {formatDate(receipt.receivedAt)}
          </DialogDescription>
        </DialogHeader>
        <div className='max-h-[65vh] space-y-3 overflow-auto pr-1'>
          <dl className='grid gap-2 text-sm sm:grid-cols-2'>
            <div>
              <dt className='text-xs text-muted-foreground'>
                {t('procurement.receipts.receivedBy')}
              </dt>
              <dd>{receipt.receivedByName ?? '—'}</dd>
            </div>
            <div>
              <dt className='text-xs text-muted-foreground'>
                {t('procurement.receipts.registeredAt')}
              </dt>
              <dd>{formatDateTime(receipt.createdAt)}</dd>
            </div>
            <div className='sm:col-span-2'>
              <dt className='text-xs text-muted-foreground'>
                {t('procurement.receipts.remark')}
              </dt>
              <dd>{receipt.remark ?? '—'}</dd>
            </div>
          </dl>
          <Table>
            <THead>
              <TH>{t('procurement.orders.material')}</TH>
              <TH className='text-right'>
                {t('procurement.receipts.thisTime')}
              </TH>
            </THead>
            <tbody>
              {receipt.items.map((item) => (
                <TR key={item.id}>
                  <TD>
                    {item.materialCode} {item.materialName}
                  </TD>
                  <TD className='text-right tabular-nums'>
                    {formatQuantity(item.quantity)} {item.unit}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <AttachmentPanel
            category='signed_photo'
            description={t('procurement.receipts.signedPhotoDescription')}
            targetId={receipt.id}
            targetType='receipt'
            title={t('procurement.receipts.signedPhoto')}
          />
          <AttachmentPanel
            category='delivery_note'
            description={t('procurement.receipts.deliveryNoteDescription')}
            targetId={receipt.id}
            targetType='receipt'
            title={t('procurement.receipts.deliveryNote')}
          />
        </div>
        <DialogFooter>
          <Button onClick={onClose} type='button' variant='outline'>
            {t('actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function receiptErrorMessage(
  t: (key: string, options?: Record<string, unknown>) => string,
  error: unknown,
): string {
  const code = errorCode(error);
  if (code === 'RECEIPT_QUANTITY_EXCEEDED') {
    const details = errorDetails(error);
    return t('procurement.receipts.quantityExceeded', {
      remaining: formatQuantity(Number(details?.remaining ?? 0)),
    });
  }
  if (code === 'RECEIPT_ITEM_NOT_IN_ORDER') {
    return t('procurement.receipts.itemNotInOrder');
  }
  if (code === 'ORDER_NOT_APPROVED') {
    return t('procurement.receipts.orderNotApproved');
  }
  if (code === 'FORBIDDEN' || code === 'UNAUTHORIZED') {
    return t('procurement.forbidden');
  }
  return t('procurement.saveFailed');
}
