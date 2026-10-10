import type { ApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useMemo, type ReactElement } from 'react';
import { useParams } from 'react-router';

import {
  getOrder,
  getOrderTimeline,
  listCustomers,
  listDevices,
  listDirectoryUsers,
} from '@/api/service';
import type {
  Customer,
  Device,
  OrderTimeline as OrderTimelineData,
  ServiceOrder,
} from '@/api/service-types';
import type { DirectoryUser } from '@/api/service';
import { RouteDrawer } from '@/components/route-drawer';
import { DetailItem, DetailList } from '@/components/service/detail-list';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { useServiceOutlet } from '@/components/service/outlet-context';
import {
  OrderStatusBadge,
  OrderPriorityBadge,
} from '@/components/service/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { useServiceResource } from '@/hooks/use-service-resource';

import { OrderActions } from './actions.js';
import { OrderAttachments } from './attachments.js';
import { OrderShares } from './shares.js';
import { OrderTimeline } from './timeline.js';

interface OrderDetailData {
  readonly order: ServiceOrder;
  readonly timeline: OrderTimelineData;
}

interface OrderCatalog {
  readonly customers: readonly Customer[];
  readonly devices: readonly Device[];
  readonly users: readonly DirectoryUser[];
}

/**
 * One order, opened over the page the user was on.
 *
 * The drawers under `/orders` and `/dashboard` both render this page, so a
 * record opened from the dashboard stacks on the dashboard rather than
 * navigating to the order list. Every action panel writes through the API and
 * then re-reads the order: the status shown is the server's, not the optimistic
 * guess of the button that was pressed.
 */
export default function OrderDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { orderId } = useParams();
  const id = Number(orderId);
  const { reload: reloadList } = useServiceOutlet();

  const loadOrder = useCallback(
    async (api: ApiClient, signal: AbortSignal): Promise<OrderDetailData> => {
      const [order, timeline] = await Promise.all([
        getOrder(api, id, signal),
        getOrderTimeline(api, id, signal),
      ]);
      return { order, timeline };
    },
    [id],
  );
  const loadCatalog = useCallback(
    async (api: ApiClient, signal: AbortSignal) => {
      const [customers, devices, users] = await Promise.all([
        listCustomers(api, undefined, signal),
        listDevices(api, {}, signal),
        // A role that may view orders but not the directory still sees the
        // record; only the assignee's name falls back to the id it stores.
        listDirectoryUsers(api, signal).catch(
          (): readonly DirectoryUser[] => [],
        ),
      ]);
      return {
        customers: customers.data,
        devices: devices.data,
        users,
      };
    },
    [],
  );

  const detail = useServiceResource<OrderDetailData>(
    `service-order:${id}`,
    loadOrder,
  );
  const catalog = useServiceResource<OrderCatalog>(
    'service-order-catalog',
    loadCatalog,
  );

  const { reload: reloadDetail } = detail;
  const reload = useCallback(async (): Promise<void> => {
    reloadDetail();
    reloadList();
  }, [reloadDetail, reloadList]);

  const order = detail.data?.order;
  const names = useMemo(
    () => ({
      customer: new Map(
        (catalog.data?.customers ?? []).map((row) => [row.id, row.name]),
      ),
      device: new Map(
        (catalog.data?.devices ?? []).map((row) => [row.id, row.name]),
      ),
      user: new Map(
        (catalog.data?.users ?? []).map((row) => [row.id, row.name]),
      ),
    }),
    [catalog.data],
  );

  return (
    <RouteDrawer
      className='sm:max-w-2xl'
      description={order ? order.orderNo : undefined}
      footer={<OrderDetailFooter />}
      title={order ? order.title : t('service.orders.detailTitle')}
    >
      {detail.error ? (
        <ServiceErrorNotice error={detail.error} onRetry={detail.reload} />
      ) : null}

      {!order && detail.isPending ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Spinner aria-hidden='true' />
          {t('service.common.loading')}
        </div>
      ) : null}

      {order ? (
        <div className='space-y-6'>
          <div className='flex flex-wrap items-center gap-2'>
            <OrderStatusBadge status={order.status} />
            <OrderPriorityBadge priority={order.priority} />
            {order.confidential ? (
              <span className='text-xs text-muted-foreground'>
                {t('service.orders.confidential')}
              </span>
            ) : null}
          </div>

          <DetailList>
            <DetailItem label={t('service.orders.orderNo')}>
              {order.orderNo}
            </DetailItem>
            <DetailItem label={t('service.orders.createdAt')}>
              {order.createdAt}
            </DetailItem>
            <DetailItem label={t('service.orders.customer')}>
              {order.customerId === null
                ? null
                : (names.customer.get(order.customerId) ?? order.customerId)}
            </DetailItem>
            <DetailItem label={t('service.orders.device')}>
              {order.deviceId === null
                ? null
                : (names.device.get(order.deviceId) ?? order.deviceId)}
            </DetailItem>
            <DetailItem label={t('service.orders.assignee')}>
              {order.assigneeId === null
                ? null
                : (names.user.get(order.assigneeId) ?? order.assigneeId)}
            </DetailItem>
            <DetailItem label={t('service.orders.dueAt')}>
              {order.dueAt}
            </DetailItem>
            <DetailItem label={t('service.orders.acceptedAt')}>
              {order.acceptedAt}
            </DetailItem>
            <DetailItem label={t('service.orders.submittedAt')}>
              {order.submittedAt}
            </DetailItem>
            <DetailItem label={t('service.orders.closedAt')}>
              {order.closedAt}
            </DetailItem>
            <DetailItem label={t('service.orders.source')}>
              {t(`service.orderSource.${order.source}`)}
            </DetailItem>
            <DetailItem wide label={t('service.orders.orderDescription')}>
              {order.description}
            </DetailItem>
            <DetailItem wide label={t('service.orders.resolution')}>
              {order.resolution}
            </DetailItem>
            <DetailItem wide label={t('service.orders.acceptanceNote')}>
              {order.acceptanceNote}
            </DetailItem>
            <DetailItem wide label={t('service.orders.returnReason')}>
              {order.returnReason}
            </DetailItem>
          </DetailList>

          <Tabs defaultValue='actions'>
            <TabsList aria-label={t('service.orders.detailSections')}>
              <TabsTrigger value='actions'>
                {t('service.orders.sectionActions')}
              </TabsTrigger>
              <TabsTrigger value='attachments'>
                {t('service.orders.sectionAttachments')}
              </TabsTrigger>
              <TabsTrigger value='shares'>
                {t('service.orders.sectionShares')}
              </TabsTrigger>
              <TabsTrigger value='timeline'>
                {t('service.orders.sectionTimeline')}
              </TabsTrigger>
            </TabsList>
            <TabsContent className='pt-4' value='actions'>
              <OrderActions order={order} reload={reload} />
            </TabsContent>
            <TabsContent className='pt-4' value='attachments'>
              <OrderAttachments order={order} reload={reload} />
            </TabsContent>
            <TabsContent className='pt-4' value='shares'>
              <OrderShares
                order={order}
                reload={reload}
                shares={detail.data?.timeline.shares ?? []}
              />
            </TabsContent>
            <TabsContent className='pt-4' value='timeline'>
              <OrderTimeline logs={detail.data?.timeline.logs ?? []} />
            </TabsContent>
          </Tabs>
        </div>
      ) : null}
    </RouteDrawer>
  );
}

// `useRouteOverlay()` may only be called inside the overlay, so the footer is
// its own component even though `close` is the only overlay value it needs.
function OrderDetailFooter(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <Button onClick={() => void close()} variant='outline'>
      {t('service.actions.close')}
    </Button>
  );
}
