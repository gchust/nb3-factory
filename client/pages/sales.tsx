import { useTranslation } from '@nocobase/i18n/client';
import {
  useCallback,
  useEffect,
  Fragment,
  useState,
  type ReactElement,
} from 'react';

import {
  Banner,
  EmptyState,
  Money,
  PageHeader,
  Panel,
} from '@/components/retail-ui';
import {
  cellClass,
  formatDateTime,
  rowClass,
  tableClass,
  theadClass,
} from '@/lib/retail-view';
import { Button } from '@/components/ui/button';
import {
  readRetailError,
  retailErrorKey,
  useRetailApi,
  type RetailAccess,
  type RetailOrder,
} from '@/lib/retail-api';

export default function SalesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useRetailApi();
  const [orders, setOrders] = useState<readonly RetailOrder[]>([]);
  const [access, setAccess] = useState<RetailAccess>();
  const [expanded, setExpanded] = useState<number>();
  const [confirming, setConfirming] = useState<number>();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [returning, setReturning] = useState(false);

  const errorText = useCallback(
    (caught: unknown): string => {
      const info = readRetailError(caught);
      return t(retailErrorKey(info.code), {
        defaultValue: info.message ?? 'Request failed.',
      });
    },
    [t],
  );

  const load = useCallback(async (): Promise<void> => {
    try {
      const [list, capabilities] = await Promise.all([
        api.listOrders(),
        api.access(),
      ]);
      setOrders(list);
      setAccess(capabilities);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [api, errorText]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const doReturn = async (id: number): Promise<void> => {
    setReturning(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await api.returnOrder(id);
      setMessage(
        t('retail.sales.returned', { defaultValue: 'Order returned.' }),
      );
      setConfirming(undefined);
      await load();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setReturning(false);
    }
  };

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-8'>
      <PageHeader
        description={t('retail.sales.description', {
          defaultValue: 'Sales orders you are allowed to see.',
        })}
        title={t('retail.sales.title', { defaultValue: 'Sales orders' })}
      />

      {error ? <Banner tone='error'>{error}</Banner> : null}
      {message ? <Banner tone='success'>{message}</Banner> : null}

      <Panel>
        {loading ? (
          <EmptyState
            message={t('retail.common.loading', { defaultValue: 'Loading…' })}
          />
        ) : orders.length === 0 ? (
          <EmptyState
            message={t('retail.sales.empty', {
              defaultValue: 'No sales orders.',
            })}
          />
        ) : (
          <div className='overflow-x-auto'>
            <table className={tableClass}>
              <thead className={theadClass}>
                <tr>
                  <th className={cellClass}>
                    {t('retail.common.orderNumber', { defaultValue: 'Order' })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.soldAt', { defaultValue: 'Sold at' })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.cashier', { defaultValue: 'Cashier' })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.paymentMethod', {
                      defaultValue: 'Payment',
                    })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.original', { defaultValue: 'Original' })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.discount', { defaultValue: 'Discount' })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.payable', { defaultValue: 'Payable' })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.status', { defaultValue: 'Status' })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.actions', { defaultValue: 'Actions' })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <Fragment key={order.id}>
                    <tr className={rowClass}>
                      <td className={cellClass}>
                        <button
                          className='font-medium underline-offset-2 hover:underline'
                          onClick={() =>
                            setExpanded(
                              expanded === order.id ? undefined : order.id,
                            )
                          }
                          type='button'
                        >
                          {order.orderNumber}
                        </button>
                      </td>
                      <td className={cellClass}>
                        {formatDateTime(order.soldAt)}
                      </td>
                      <td className={cellClass}>{order.cashierName}</td>
                      <td className={cellClass}>
                        {t(`retail.payment.${order.paymentMethod}`, {
                          defaultValue: order.paymentMethod,
                        })}
                      </td>
                      <td className={cellClass}>
                        <Money value={order.originalAmount} />
                      </td>
                      <td className={cellClass}>
                        <Money value={order.discountAmount} />
                      </td>
                      <td className={cellClass}>
                        <Money value={order.payableAmount} />
                      </td>
                      <td className={cellClass}>
                        {t(`retail.orderStatus.${order.status}`, {
                          defaultValue: order.status,
                        })}
                      </td>
                      <td className={cellClass}>
                        {access?.returnOrder && order.status === 'completed' ? (
                          confirming === order.id ? (
                            <span className='flex items-center gap-2'>
                              <Button
                                disabled={returning}
                                onClick={() => void doReturn(order.id)}
                                size='sm'
                                type='button'
                                variant='secondary'
                              >
                                {t('retail.common.confirm', {
                                  defaultValue: 'Confirm',
                                })}
                              </Button>
                              <Button
                                onClick={() => setConfirming(undefined)}
                                size='sm'
                                type='button'
                                variant='ghost'
                              >
                                {t('retail.common.cancel', {
                                  defaultValue: 'Cancel',
                                })}
                              </Button>
                            </span>
                          ) : (
                            <Button
                              onClick={() => setConfirming(order.id)}
                              size='sm'
                              type='button'
                              variant='secondary'
                            >
                              {t('retail.sales.return', {
                                defaultValue: 'Return',
                              })}
                            </Button>
                          )
                        ) : null}
                      </td>
                    </tr>
                    {expanded === order.id ? (
                      <tr className={rowClass}>
                        <td className={cellClass} colSpan={9}>
                          <table className='w-full text-xs'>
                            <thead className='text-muted-foreground'>
                              <tr>
                                <th className='px-2 py-1 text-left'>
                                  {t('retail.common.product', {
                                    defaultValue: 'Product',
                                  })}
                                </th>
                                <th className='px-2 py-1 text-left'>
                                  {t('retail.common.unitPrice', {
                                    defaultValue: 'Unit price',
                                  })}
                                </th>
                                <th className='px-2 py-1 text-left'>
                                  {t('retail.common.quantity', {
                                    defaultValue: 'Quantity',
                                  })}
                                </th>
                                <th className='px-2 py-1 text-left'>
                                  {t('retail.common.subtotal', {
                                    defaultValue: 'Subtotal',
                                  })}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.items.map((item) => (
                                <tr key={item.id}>
                                  <td className='px-2 py-1'>
                                    {item.productName}
                                  </td>
                                  <td className='px-2 py-1'>
                                    <Money value={item.unitPrice} />
                                  </td>
                                  <td className='px-2 py-1'>{item.quantity}</td>
                                  <td className='px-2 py-1'>
                                    <Money value={item.subtotal} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </section>
  );
}
