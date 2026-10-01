import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowLeftIcon,
  HardDriveIcon,
  PhoneIcon,
  UserIcon,
} from 'lucide-react';
import { useMemo, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import {
  useServiceResource,
  type Customer,
  type Device,
  type WorkOrder,
} from './model.js';
import {
  ErrorState,
  LoadingState,
  PriorityBadge,
  StatusBadge,
} from './shared.js';

export default function CustomerDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { id = '' } = useParams<{ id: string }>();
  const customer = useServiceResource<Customer>(`customers/${id}`);
  const devices = useServiceResource<Device[]>('devices');
  const orders = useServiceResource<WorkOrder[]>('work-orders');

  const customerDevices = useMemo(
    () => (devices.data ?? []).filter((device) => device.customerId === id),
    [devices.data, id],
  );
  const customerOrders = useMemo(
    () => (orders.data ?? []).filter((order) => order.customerId === id),
    [orders.data, id],
  );

  if (customer.loading) {
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }
  if (customer.error || !customer.data) {
    return (
      <PageContainer>
        <ErrorState
          message={customer.error ?? t('service.loadFailed')}
          onRetry={customer.reload}
        />
      </PageContainer>
    );
  }

  const data = customer.data;

  return (
    <PageContainer>
      <Button
        variant='ghost'
        size='sm'
        className='w-fit'
        nativeButton={false}
        render={<Link to='/customers' />}
      >
        <ArrowLeftIcon data-icon='inline-start' />
        {t('service.customers.backToList')}
      </Button>

      <PageHeader
        title={data.name}
        description={t('service.customers.detailDescription')}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('service.customers.profile')}</CardTitle>
          <CardDescription>{data.notes ?? ''}</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4 sm:grid-cols-2'>
          <div className='flex items-center gap-2 text-sm'>
            <UserIcon className='size-4 text-muted-foreground' />
            {data.contactName ?? '—'}
          </div>
          <div className='flex items-center gap-2 text-sm'>
            <PhoneIcon className='size-4 text-muted-foreground' />
            {data.contactPhone ?? '—'}
          </div>
        </CardContent>
      </Card>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <HardDriveIcon className='size-4' />
              {t('navigation.devices')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {customerDevices.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('service.empty')}
              </p>
            ) : (
              <ul className='divide-y'>
                {customerDevices.map((device) => (
                  <li
                    key={device.id}
                    className='flex items-center justify-between py-2 text-sm'
                  >
                    <span className='font-mono text-xs'>{device.code}</span>
                    <span>{device.name}</span>
                    {device.enabled ? (
                      <Badge variant='secondary'>
                        {t('service.devices.active')}
                      </Badge>
                    ) : (
                      <Badge variant='outline'>
                        {t('service.devices.inactive')}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('navigation.workOrders')}</CardTitle>
          </CardHeader>
          <CardContent>
            {customerOrders.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('service.empty')}
              </p>
            ) : (
              <ul className='divide-y'>
                {customerOrders.map((order) => (
                  <li
                    key={order.id}
                    className='flex items-center justify-between gap-2 py-2 text-sm'
                  >
                    <Link
                      to={`/work-orders/${order.id}`}
                      className='truncate hover:underline'
                    >
                      {order.title}
                    </Link>
                    <span className='flex items-center gap-2'>
                      <PriorityBadge priority={order.priority} />
                      <StatusBadge status={order.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
