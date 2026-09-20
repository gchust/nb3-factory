import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { AttachmentList } from '@/components/repair/attachment-list';
import { StatusBadge } from '@/components/repair/badges';
import { DataState } from '@/components/repair/data-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatDate, repairApi } from '@/lib/repair-api';
import { useApiData } from '@/lib/use-repair';

export default function EquipmentDetailPage(): ReactElement {
  const { t } = useTranslation();
  const params = useParams();
  const equipmentId = Number(params.id ?? 0);
  const detail = useApiData(`repair/equipment:${equipmentId}`, (api) =>
    repairApi.equipmentDetail(api, equipmentId),
  );
  const equipment = detail.data?.equipment;

  return (
    <PageContainer>
      <PageHeader
        title={
          equipment
            ? `${equipment.code} · ${equipment.name}`
            : t('repair.equipment.detail', { defaultValue: 'Equipment' })
        }
        description={
          equipment
            ? t('repair.equipment.place', { defaultValue: 'Place' }) +
              `: ${[equipment.buildingName, equipment.roomNumber].filter(Boolean).join(' ')}`
            : undefined
        }
        actions={
          <Button variant='outline' render={<Link to='/equipment' />}>
            <ArrowLeft aria-hidden='true' />
            {t('repair.form.back', { defaultValue: 'Back to list' })}
          </Button>
        }
      />

      <DataState
        loading={detail.loading}
        error={detail.error}
        onRetry={detail.reload}
      >
        {equipment ? (
          <div className='grid gap-4 lg:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle>
                  {t('repair.equipment.info', { defaultValue: 'Equipment' })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className='grid gap-3 sm:grid-cols-2'>
                  <div>
                    <dt className='text-xs text-muted-foreground'>
                      {t('repair.equipment.brand', { defaultValue: 'Brand' })}
                    </dt>
                    <dd className='text-sm'>{equipment.brand ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className='text-xs text-muted-foreground'>
                      {t('repair.equipment.model', { defaultValue: 'Model' })}
                    </dt>
                    <dd className='text-sm'>{equipment.model ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className='text-xs text-muted-foreground'>
                      {t('repair.equipment.serial', {
                        defaultValue: 'Serial number',
                      })}
                    </dt>
                    <dd className='text-sm'>{equipment.serialNumber ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className='text-xs text-muted-foreground'>
                      {t('repair.equipment.status', { defaultValue: 'Status' })}
                    </dt>
                    <dd className='text-sm'>
                      {t(`repair.equipmentStatus.${equipment.status}`, {
                        defaultValue: equipment.status,
                      })}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {t('repair.equipment.manual', { defaultValue: 'Manual' })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AttachmentList
                  attachments={detail.data?.attachments ?? []}
                  canEdit={false}
                  onChanged={detail.reload}
                />
              </CardContent>
            </Card>

            <Card className='lg:col-span-2'>
              <CardHeader>
                <CardTitle>
                  {t('repair.equipment.history', {
                    defaultValue: 'Repair history',
                  })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {detail.data?.history.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          {t('repair.tickets.number', {
                            defaultValue: 'Ticket',
                          })}
                        </TableHead>
                        <TableHead>
                          {t('repair.tickets.subject', {
                            defaultValue: 'Subject',
                          })}
                        </TableHead>
                        <TableHead>
                          {t('repair.tickets.status', {
                            defaultValue: 'Status',
                          })}
                        </TableHead>
                        <TableHead>
                          {t('repair.tickets.due', { defaultValue: 'Due' })}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.data.history.map((ticket) => (
                        <TableRow key={ticket.id} data-testid='history-row'>
                          <TableCell className='font-mono text-xs'>
                            {ticket.ticketNo}
                          </TableCell>
                          <TableCell>
                            <Link
                              className='hover:underline'
                              to={`/tickets/${ticket.id}`}
                            >
                              {ticket.title}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={ticket.status} />
                          </TableCell>
                          <TableCell className='text-sm'>
                            {formatDate(ticket.dueAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className='text-sm text-muted-foreground' role='status'>
                    {t('repair.empty', {
                      defaultValue: 'Nothing to show yet.',
                    })}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </DataState>
    </PageContainer>
  );
}
