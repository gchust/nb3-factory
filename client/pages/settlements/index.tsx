import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { DataState } from '@/components/repair/data-state';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime, formatMoney, repairApi } from '@/lib/repair-api';
import { useApiData } from '@/lib/use-repair';

export default function SettlementsPage(): ReactElement {
  const { t } = useTranslation();
  const settlements = useApiData('repair/settlements', (api) =>
    repairApi.settlements(api, {}),
  );
  const total = (settlements.data?.rows ?? []).reduce(
    (sum, row) => sum + row.totalAmount,
    0,
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('repair.settlements.title', { defaultValue: 'Settlements' })}
        description={t('repair.settlements.description', {
          defaultValue:
            'One bill per accepted ticket. Amount = materials + labor, never negative.',
        })}
      />

      <Card>
        <CardContent className='flex items-center justify-between p-4'>
          <span className='text-sm text-muted-foreground'>
            {t('repair.settlements.count', {
              count: settlements.data?.total ?? 0,
              defaultValue: '{{count}} settlements',
            })}
          </span>
          <span className='text-lg tabular-nums' data-testid='settlement-total'>
            {formatMoney(total)}
          </span>
        </CardContent>
      </Card>

      <DataState
        loading={settlements.loading}
        error={settlements.error}
        empty={settlements.data?.rows.length === 0}
        onRetry={settlements.reload}
      >
        <div className='rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('repair.settlements.number', {
                    defaultValue: 'Settlement',
                  })}
                </TableHead>
                <TableHead>
                  {t('repair.settlements.ticket', { defaultValue: 'Ticket' })}
                </TableHead>
                <TableHead>
                  {t('repair.settlements.building', {
                    defaultValue: 'Building',
                  })}
                </TableHead>
                <TableHead>
                  {t('repair.ticket.materialCost', {
                    defaultValue: 'Materials',
                  })}
                </TableHead>
                <TableHead>
                  {t('repair.ticket.labor', { defaultValue: 'Labor cost' })}
                </TableHead>
                <TableHead>
                  {t('repair.ticket.total', { defaultValue: 'Total' })}
                </TableHead>
                <TableHead>
                  {t('repair.settlements.settledBy', {
                    defaultValue: 'Settled by',
                  })}
                </TableHead>
                <TableHead>
                  {t('repair.settlements.settledAt', {
                    defaultValue: 'Settled at',
                  })}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(settlements.data?.rows ?? []).map((row) => (
                <TableRow key={row.id} data-testid='settlement-row'>
                  <TableCell className='font-mono text-xs'>
                    {row.settlementNo}
                  </TableCell>
                  <TableCell>
                    <Link
                      className='hover:underline'
                      to={`/tickets/${row.ticketId}`}
                    >
                      {row.ticketNo} · {row.ticketTitle}
                    </Link>
                  </TableCell>
                  <TableCell className='text-sm'>
                    {row.buildingName ?? '—'}
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {formatMoney(row.materialCost)}
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {formatMoney(row.laborCost)}
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {formatMoney(row.totalAmount)}
                  </TableCell>
                  <TableCell className='text-sm'>
                    {row.settledByName ?? '—'}
                  </TableCell>
                  <TableCell className='text-sm'>
                    {formatDateTime(row.settledAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DataState>
    </PageContainer>
  );
}
