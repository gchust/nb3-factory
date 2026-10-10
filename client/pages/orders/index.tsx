import type { ApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { Plus, RefreshCw, Search } from 'lucide-react';
import {
  useCallback,
  useMemo,
  useReducer,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { Link, Outlet } from 'react-router';

import { listCustomers, listDevices, listOrders } from '@/api/service';
import {
  ORDER_PRIORITIES,
  ORDER_STATUSES,
  type Customer,
  type Device,
  type ServiceList,
  type ServiceOrder,
} from '@/api/service-types';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { FormField, SelectControl } from '@/components/service/form-field';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { ServiceTable } from '@/components/service/service-table';
import {
  OrderPriorityBadge,
  OrderStatusBadge,
} from '@/components/service/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useServiceResource } from '@/hooks/use-service-resource';

interface OrderFilters {
  readonly keyword: string;
  readonly status: string;
  readonly priority: string;
}

const NO_FILTERS: OrderFilters = { keyword: '', status: '', priority: '' };

/**
 * The order queue.
 *
 * The list is filtered by the server: the endpoint validates the filters and
 * applies the caller's record policies, so what a signed-in user sees is what
 * the server decided they may see, not what the page chose to hide. Customer
 * and device names are resolved from the catalog, which the read action of the
 * order permission already grants, because an order row stores only the ids.
 */
export default function ServiceOrdersPage(): ReactElement {
  const { t } = useTranslation();
  const [draftKeyword, setDraftKeyword] = useState('');
  const [filters, setFilters] = useState<OrderFilters>(NO_FILTERS);
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);

  const canCreate = useCan({
    resource: { type: 'composite', id: 'service.orders' },
    action: 'create',
  });

  const loadOrders = useCallback(
    (api: ApiClient, signal: AbortSignal) =>
      listOrders(
        api,
        {
          keyword: filters.keyword || undefined,
          status: filters.status || undefined,
          priority: filters.priority || undefined,
          limit: 100,
        },
        signal,
      ),
    [filters],
  );

  const loadCatalog = useCallback(
    (api: ApiClient, signal: AbortSignal) =>
      Promise.all([
        listCustomers(api, undefined, signal),
        listDevices(api, {}, signal),
      ]),
    [],
  );

  const orders = useServiceResource(
    JSON.stringify([filters, reloadCount]),
    loadOrders,
  );
  const catalog = useServiceResource('service-order-catalog', loadCatalog);

  const customerNames = useMemo(() => {
    const pages = catalog.data as
      readonly [ServiceList<Customer>, ServiceList<Device>] | undefined;
    return new Map((pages?.[0].data ?? []).map((row) => [row.id, row.name]));
  }, [catalog.data]);
  const deviceNames = useMemo(() => {
    const pages = catalog.data as
      readonly [ServiceList<Customer>, ServiceList<Device>] | undefined;
    return new Map((pages?.[1].data ?? []).map((row) => [row.id, row.name]));
  }, [catalog.data]);

  const nameOf = (
    map: ReadonlyMap<number, string>,
    id: number | null,
  ): string => (id === null ? '—' : (map.get(id) ?? String(id)));

  function submitKeyword(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFilters((current) => ({ ...current, keyword: draftKeyword.trim() }));
  }

  const outletContext = useMemo(() => ({ reload }), [reload]);

  return (
    <PageContainer>
      <PageHeader
        title={t('service.orders.title')}
        description={t('service.orders.description')}
        actions={
          <>
            <Button onClick={reload} size='sm' variant='outline'>
              <RefreshCw aria-hidden='true' />
              {t('service.actions.refresh')}
            </Button>
            {canCreate.can ? (
              <Button render={<Link to='new' />} size='sm'>
                <Plus aria-hidden='true' />
                {t('service.orders.createAction')}
              </Button>
            ) : null}
          </>
        }
      />

      <form
        className='flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4'
        onSubmit={submitKeyword}
        role='search'
      >
        <FormField
          className='min-w-56 flex-1'
          htmlFor='order-keyword'
          label={t('service.actions.search')}
        >
          <Input
            id='order-keyword'
            onChange={(event) => {
              setDraftKeyword(event.target.value);
            }}
            placeholder={t('service.orders.keywordPlaceholder')}
            value={draftKeyword}
          />
        </FormField>
        <FormField htmlFor='order-status' label={t('service.orders.status')}>
          <SelectControl
            id='order-status'
            onChange={(value) => {
              setFilters((current) => ({ ...current, status: value }));
            }}
            options={[
              { value: '', label: t('service.orders.allStatuses') },
              ...ORDER_STATUSES.map((status) => ({
                value: status,
                label: t(`service.orderStatus.${status}`),
              })),
            ]}
            value={filters.status}
          />
        </FormField>
        <FormField
          htmlFor='order-priority'
          label={t('service.orders.priority')}
        >
          <SelectControl
            id='order-priority'
            onChange={(value) => {
              setFilters((current) => ({ ...current, priority: value }));
            }}
            options={[
              { value: '', label: t('service.orders.allPriorities') },
              ...ORDER_PRIORITIES.map((priority) => ({
                value: priority,
                label: t(`service.priority.${priority}`),
              })),
            ]}
            value={filters.priority}
          />
        </FormField>
        <Button size='sm' type='submit' variant='secondary'>
          <Search aria-hidden='true' />
          {t('service.actions.search')}
        </Button>
        <Button
          onClick={() => {
            setDraftKeyword('');
            setFilters(NO_FILTERS);
          }}
          size='sm'
          type='button'
          variant='ghost'
        >
          {t('service.actions.reset')}
        </Button>
      </form>

      {orders.error ? (
        <ServiceErrorNotice error={orders.error} onRetry={orders.reload} />
      ) : null}

      <ServiceTable
        caption={t('service.orders.title')}
        columns={[
          {
            key: 'orderNo',
            header: t('service.orders.orderNo'),
            cell: (order: ServiceOrder) => (
              <Link
                className='font-medium underline-offset-4 hover:underline'
                to={String(order.id)}
              >
                {order.orderNo}
              </Link>
            ),
          },
          {
            key: 'title',
            header: t('service.orders.orderTitle'),
            cell: (order) => (
              <span className='block max-w-80 truncate'>{order.title}</span>
            ),
          },
          {
            key: 'customer',
            header: t('service.orders.customer'),
            cell: (order) => nameOf(customerNames, order.customerId),
          },
          {
            key: 'device',
            header: t('service.orders.device'),
            cell: (order) => nameOf(deviceNames, order.deviceId),
          },
          {
            key: 'status',
            header: t('service.orders.status'),
            cell: (order) => <OrderStatusBadge status={order.status} />,
          },
          {
            key: 'priority',
            header: t('service.orders.priority'),
            cell: (order) => <OrderPriorityBadge priority={order.priority} />,
          },
          {
            key: 'dueAt',
            header: t('service.orders.dueAt'),
            cell: (order) => order.dueAt ?? '—',
          },
        ]}
        empty={t('service.orders.empty')}
        isPending={orders.isPending}
        rowKey={(order) => String(order.id)}
        rows={orders.data?.data ?? []}
      />

      <Outlet context={outletContext} />
    </PageContainer>
  );
}
