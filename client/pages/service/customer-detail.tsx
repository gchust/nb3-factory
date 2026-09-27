import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeftIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { asBoolean, asText, formatDateTime } from '../../service/format.js';
import { useResource, useServiceApi, type Row } from '../../service/api.js';
import {
  FieldRow,
  InfoGrid,
  QueryState,
  RegionBadge,
  SectionCard,
  StatusBadge,
} from '../../service/ui.js';

interface CustomerDetail extends Row {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly region: string;
  readonly status: string;
  readonly devices: readonly Row[];
  readonly tickets: readonly Row[];
}

/** One customer, its devices and its most recent tickets. */
export default function CustomerDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const params = useParams<{ customerId: string }>();
  const customerId = Number(params.customerId);
  const customer = useResource(`service:customer:${customerId}`, () =>
    api.getCustomer(customerId),
  );
  const detail = customer.data as unknown as CustomerDetail | undefined;

  return (
    <PageContainer>
      <Button
        variant='ghost'
        size='sm'
        render={<Link to='/service/customers' />}
      >
        <ArrowLeftIcon />
        {t('service.customers.backToList')}
      </Button>

      <QueryState
        loading={customer.loading}
        error={customer.error}
        onRetry={customer.reload}
      >
        {detail ? (
          <>
            <PageHeader
              title={
                <span className='flex flex-wrap items-center gap-3'>
                  {detail.name}
                  <RegionBadge value={detail.region} />
                  <StatusBadge kind='customer' value={detail.status} />
                  <Badge variant='outline'>{asText(detail.code)}</Badge>
                </span>
              }
              description={t('service.customers.detailDescription')}
            />

            <SectionCard title={t('service.customers.overview')}>
              <InfoGrid>
                <FieldRow label={t('service.customers.contact')}>
                  {asText(detail.contactName) || '—'}
                </FieldRow>
                <FieldRow label={t('service.customers.phone')}>
                  {asText(detail.contactPhone) || '—'}
                </FieldRow>
                <FieldRow label={t('service.customers.email')}>
                  {asText(detail.contactEmail) || '—'}
                </FieldRow>
                <FieldRow label={t('service.customers.level')}>
                  <StatusBadge kind='level' value={detail.level} />
                </FieldRow>
                <FieldRow label={t('service.customers.address')}>
                  {asText(detail.address) || '—'}
                </FieldRow>
                <FieldRow label={t('service.customers.notes')}>
                  {asText(detail.notes) || '—'}
                </FieldRow>
              </InfoGrid>
            </SectionCard>

            <SectionCard title={t('service.customers.devices')}>
              <DeviceTable rows={detail.devices} />
            </SectionCard>

            <SectionCard title={t('service.customers.recentTickets')}>
              <TicketTable rows={detail.tickets} />
            </SectionCard>
          </>
        ) : null}
      </QueryState>
    </PageContainer>
  );
}

function DeviceTable({
  rows,
}: {
  readonly rows: readonly Row[];
}): ReactElement {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('service.common.empty')}
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('service.devices.serialNumber')}</TableHead>
          <TableHead>{t('service.devices.name')}</TableHead>
          <TableHead>{t('service.devices.model')}</TableHead>
          <TableHead>{t('service.devices.status')}</TableHead>
          <TableHead>{t('service.devices.enabled')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((device) => (
          <TableRow key={asText(device.id)}>
            <TableCell>
              <Link
                className='font-medium hover:underline'
                to={`/service/devices/${asText(device.id)}`}
              >
                {asText(device.serialNumber)}
              </Link>
            </TableCell>
            <TableCell>{asText(device.name)}</TableCell>
            <TableCell>{asText(device.model) || '—'}</TableCell>
            <TableCell>
              <StatusBadge kind='device' value={device.status} />
            </TableCell>
            <TableCell>
              {asBoolean(device.enabled)
                ? t('service.common.yes')
                : t('service.common.no')}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TicketTable({
  rows,
}: {
  readonly rows: readonly Row[];
}): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (rows.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('service.common.empty')}
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('service.tickets.serial')}</TableHead>
          <TableHead>{t('service.tickets.titleColumn')}</TableHead>
          <TableHead>{t('service.tickets.status')}</TableHead>
          <TableHead>{t('service.tickets.priority')}</TableHead>
          <TableHead>{t('service.tickets.createdAt')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((ticket) => (
          <TableRow
            key={asText(ticket.id)}
            className='cursor-pointer'
            onClick={() => {
              void navigate(`/service/tickets/${asText(ticket.id)}`);
            }}
          >
            <TableCell>
              <Link
                className='font-medium hover:underline'
                to={`/service/tickets/${asText(ticket.id)}`}
                onClick={(event) => event.stopPropagation()}
              >
                {asText(ticket.serial)}
              </Link>
            </TableCell>
            <TableCell className='max-w-72 truncate'>
              {asText(ticket.title)}
            </TableCell>
            <TableCell>
              <StatusBadge kind='ticket' value={ticket.status} />
            </TableCell>
            <TableCell>
              <StatusBadge kind='priority' value={ticket.priority} />
            </TableCell>
            <TableCell className='text-sm text-muted-foreground'>
              {formatDateTime(ticket.createdAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
