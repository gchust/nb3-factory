import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeftIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
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
  asBoolean,
  asText,
  formatDate,
  formatDateTime,
} from '../../service/format.js';
import { useResource, useServiceApi, type Row } from '../../service/api.js';
import {
  FieldRow,
  InfoGrid,
  QueryState,
  RegionBadge,
  SectionCard,
  StatusBadge,
} from '../../service/ui.js';

interface DeviceDetail extends Row {
  readonly id: number;
  readonly serialNumber: string;
  readonly name: string;
  readonly region: string;
  readonly status: string;
  readonly enabled: boolean;
  readonly customer: Row | null;
  readonly tickets: readonly Row[];
  readonly inspections: readonly Row[];
}

/** One device, its owner, its tickets and its recent inspection tasks. */
export default function DeviceDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const navigate = useNavigate();
  const params = useParams<{ deviceId: string }>();
  const deviceId = Number(params.deviceId);
  const device = useResource(`service:device:${deviceId}`, () =>
    api.getDevice(deviceId),
  );
  const detail = device.data as unknown as DeviceDetail | undefined;

  return (
    <PageContainer>
      <Button variant='ghost' size='sm' render={<Link to='/service/devices' />}>
        <ArrowLeftIcon />
        {t('service.devices.backToList')}
      </Button>

      <QueryState
        loading={device.loading}
        error={device.error}
        onRetry={device.reload}
      >
        {detail ? (
          <>
            <PageHeader
              title={
                <span className='flex flex-wrap items-center gap-3'>
                  {detail.serialNumber}
                  <RegionBadge value={detail.region} />
                  <StatusBadge kind='device' value={detail.status} />
                </span>
              }
              description={asText(detail.name)}
            />

            <SectionCard title={t('service.devices.overview')}>
              <InfoGrid>
                <FieldRow label={t('service.devices.name')}>
                  {asText(detail.name)}
                </FieldRow>
                <FieldRow label={t('service.devices.model')}>
                  {asText(detail.model) || '—'}
                </FieldRow>
                <FieldRow label={t('service.devices.location')}>
                  {asText(detail.location) || '—'}
                </FieldRow>
                <FieldRow label={t('service.devices.customer')}>
                  {detail.customer ? (
                    <Link
                      className='font-medium hover:underline'
                      to={`/service/customers/${asText(detail.customer.id)}`}
                    >
                      {asText(detail.customer.name)}
                    </Link>
                  ) : (
                    '—'
                  )}
                </FieldRow>
                <FieldRow label={t('service.devices.installedAt')}>
                  {formatDate(detail.installedAt)}
                </FieldRow>
                <FieldRow label={t('service.devices.warrantyUntil')}>
                  {formatDate(detail.warrantyUntil)}
                </FieldRow>
                <FieldRow label={t('service.devices.enabled')}>
                  {asBoolean(detail.enabled)
                    ? t('service.common.yes')
                    : t('service.common.no')}
                </FieldRow>
                <FieldRow label={t('service.devices.notes')}>
                  {asText(detail.notes) || '—'}
                </FieldRow>
              </InfoGrid>
            </SectionCard>

            <SectionCard title={t('service.devices.tickets')}>
              {detail.tickets.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('service.common.empty')}
                </p>
              ) : (
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
                    {detail.tickets.map((ticket) => (
                      <TableRow
                        key={asText(ticket.id)}
                        className='cursor-pointer'
                        onClick={() => {
                          void navigate(
                            `/service/tickets/${asText(ticket.id)}`,
                          );
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
                          <StatusBadge
                            kind='priority'
                            value={ticket.priority}
                          />
                        </TableCell>
                        <TableCell className='text-sm text-muted-foreground'>
                          {formatDateTime(ticket.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </SectionCard>

            <SectionCard title={t('service.devices.inspections')}>
              {detail.inspections.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('service.common.empty')}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('service.inspections.runDate')}</TableHead>
                      <TableHead>{t('service.inspections.status')}</TableHead>
                      <TableHead>
                        {t('service.inspections.triggeredBy')}
                      </TableHead>
                      <TableHead>{t('service.inspections.result')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.inspections.map((task) => (
                      <TableRow key={asText(task.id)}>
                        <TableCell>{formatDate(task.runDate)}</TableCell>
                        <TableCell>
                          <StatusBadge kind='inspection' value={task.status} />
                        </TableCell>
                        <TableCell>
                          {t(
                            `service.inspections.trigger.${asText(task.triggeredBy)}`,
                            {
                              defaultValue: asText(task.triggeredBy),
                            },
                          )}
                        </TableCell>
                        <TableCell className='max-w-72 truncate'>
                          {asText(task.result) || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </SectionCard>
          </>
        ) : null}
      </QueryState>
    </PageContainer>
  );
}
