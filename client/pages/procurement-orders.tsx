import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useState, type ReactElement } from 'react';

import {
  EmptyLine,
  ErrorLine,
  LoadingLine,
  ProcurementCard,
  ProcurementPage,
} from '@/components/procurement/page-shell';
import { StatusBadge } from '@/components/procurement/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  formatMoney,
  messageOf,
  useLoaded,
  useProcurementApi,
} from '@/lib/procurement-api';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function OrdersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useProcurementApi();
  const [requestId, setRequestId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [orderDate, setOrderDate] = useState(() => today());
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [receipts, setReceipts] = useState<
    Record<number, { quantity: string; date: string }>
  >({});
  const [receiptError, setReceiptError] = useState<Record<number, string>>({});

  const meLoader = useCallback(() => api.me(), [api]);
  const { data: me } = useLoaded(meLoader);

  const ordersLoader = useCallback(() => api.listOrders(), [api]);
  const {
    data: orders,
    loading,
    error: loadError,
    reload,
  } = useLoaded(ordersLoader);

  const requestsLoader = useCallback(() => api.listRequests(), [api]);
  const { data: requests } = useLoaded(requestsLoader);

  const suppliersLoader = useCallback(() => api.listSuppliers({}), [api]);
  const { data: suppliers } = useLoaded(suppliersLoader);

  const approvedRequests = (requests ?? []).filter(
    (request) => request.status === 'approved',
  );
  const activeSuppliers = (suppliers ?? []).filter(
    (supplier) => supplier.status === 'active',
  );

  const createOrder = async (event: {
    preventDefault(): void;
  }): Promise<void> => {
    event.preventDefault();
    setError(undefined);
    setMessage(undefined);
    try {
      await api.createOrder({
        requestId: Number(requestId),
        supplierId: Number(supplierId),
        orderDate,
      });
      setMessage(t('procurement.orders.created'));
      setRequestId('');
      setSupplierId('');
      reload();
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const registerReceipt = async (orderId: number): Promise<void> => {
    const entry = receipts[orderId] ?? { quantity: '', date: today() };
    setReceiptError((current) => ({ ...current, [orderId]: '' }));
    try {
      await api.createReceipt(orderId, {
        quantity: Number(entry.quantity),
        receivedDate: entry.date,
      });
      setMessage(t('procurement.orders.receiptRegistered'));
      setReceipts((current) => ({
        ...current,
        [orderId]: { quantity: '', date: today() },
      }));
      reload();
    } catch (cause) {
      setReceiptError((current) => ({
        ...current,
        [orderId]: messageOf(cause),
      }));
    }
  };

  return (
    <ProcurementPage title={t('procurement.orders.title')}>
      {me && !me.capabilities.manageOrders ? (
        <ErrorLine message={t('procurement.denied')} />
      ) : null}

      <ProcurementCard title={t('procurement.orders.createTitle')}>
        <form
          className='grid gap-4 md:grid-cols-3'
          onSubmit={(event) => void createOrder(event)}
        >
          <div className='space-y-2'>
            <Label htmlFor='order-request'>
              {t('procurement.orders.selectRequest')}
            </Label>
            <select
              id='order-request'
              required
              className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
              value={requestId}
              onChange={(event) => setRequestId(event.target.value)}
            >
              <option value=''>
                {approvedRequests.length === 0
                  ? t('procurement.orders.noApprovedRequests')
                  : t('procurement.orders.selectRequest')}
              </option>
              {approvedRequests.map((request) => (
                <option key={request.id} value={request.id}>
                  #{request.id} · {formatMoney(request.totalAmount)}
                </option>
              ))}
            </select>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='order-supplier'>
              {t('procurement.orders.selectSupplier')}
            </Label>
            <select
              id='order-supplier'
              required
              className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
            >
              <option value=''>{t('procurement.orders.selectSupplier')}</option>
              {activeSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='order-date'>
              {t('procurement.orders.orderDate')}
            </Label>
            <Input
              id='order-date'
              type='date'
              value={orderDate}
              onChange={(event) => setOrderDate(event.target.value)}
            />
          </div>
          <div className='md:col-span-3'>
            <Button type='submit' disabled={!requestId || !supplierId}>
              {t('procurement.orders.create')}
            </Button>
          </div>
        </form>
        {message ? (
          <p className='text-sm text-muted-foreground'>{message}</p>
        ) : null}
        {error ? <ErrorLine message={error} /> : null}
      </ProcurementCard>

      <ProcurementCard title={t('procurement.orders.title')}>
        {loading ? <LoadingLine /> : null}
        {loadError ? <ErrorLine message={loadError} /> : null}
        {orders && orders.length === 0 ? <EmptyLine /> : null}
        <div className='space-y-4'>
          {(orders ?? []).map((order) => {
            const entry = receipts[order.id] ?? { quantity: '', date: today() };
            const remaining = order.totalQuantity - order.receivedQuantity;
            return (
              <div
                key={order.id}
                className='space-y-3 rounded-lg border border-border p-4'
              >
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div>
                    <p className='font-medium'>{order.orderNumber}</p>
                    <p className='text-sm text-muted-foreground'>
                      {order.supplierName ?? order.supplierId} ·{' '}
                      {order.orderDate}
                    </p>
                  </div>
                  <div className='flex items-center gap-3'>
                    <span className='tabular-nums text-sm font-medium'>
                      {formatMoney(order.amount)}
                    </span>
                    <StatusBadge kind='order' status={order.status} />
                  </div>
                </div>
                <dl className='grid grid-cols-3 gap-3 text-sm'>
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('procurement.orders.totalQuantity')}
                    </dt>
                    <dd className='tabular-nums'>{order.totalQuantity}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('procurement.orders.receivedQuantity')}
                    </dt>
                    <dd className='tabular-nums'>{order.receivedQuantity}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('procurement.orders.remaining')}
                    </dt>
                    <dd className='tabular-nums'>{remaining}</dd>
                  </div>
                </dl>
                <div className='space-y-1'>
                  <p className='text-sm font-medium'>
                    {t('procurement.orders.receipts')}
                  </p>
                  {order.receipts.length === 0 ? (
                    <p className='text-sm text-muted-foreground'>
                      {t('procurement.empty')}
                    </p>
                  ) : (
                    <ul className='text-sm text-muted-foreground'>
                      {order.receipts.map((receipt) => (
                        <li key={receipt.id}>
                          {receipt.receivedDate} · {receipt.quantity}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className='flex flex-wrap items-end gap-2'>
                  <div className='space-y-2'>
                    <Label htmlFor={`receipt-qty-${order.id}`}>
                      {t('procurement.orders.receiptQuantity')}
                    </Label>
                    <Input
                      id={`receipt-qty-${order.id}`}
                      type='number'
                      min='0'
                      step='1'
                      className='w-32'
                      value={entry.quantity}
                      onChange={(event) =>
                        setReceipts((current) => ({
                          ...current,
                          [order.id]: {
                            ...entry,
                            quantity: event.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor={`receipt-date-${order.id}`}>
                      {t('procurement.orders.receiptDate')}
                    </Label>
                    <Input
                      id={`receipt-date-${order.id}`}
                      type='date'
                      className='w-40'
                      value={entry.date}
                      onChange={(event) =>
                        setReceipts((current) => ({
                          ...current,
                          [order.id]: { ...entry, date: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <Button
                    variant='outline'
                    disabled={!entry.quantity}
                    onClick={() => void registerReceipt(order.id)}
                  >
                    {t('procurement.orders.register')}
                  </Button>
                </div>
                {receiptError[order.id] ? (
                  <p className='text-sm text-destructive' role='alert'>
                    {receiptError[order.id]}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </ProcurementCard>
    </ProcurementPage>
  );
}
