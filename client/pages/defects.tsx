import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { apiClientToken, useService } from '@nocobase/app-client';

import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AsyncSection } from '@/components/production/async-section';
import { productionApi, type DefectRecord } from '@/lib/production-api';
import { useAsync } from '@/lib/use-async';

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export default function DefectsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const state = useAsync<DefectRecord[]>(
    () => productionApi.defects(api),
    'defects',
  );

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 p-6'>
      <header className='space-y-1'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('production.defects.title')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('production.defects.subtitle')}
        </p>
      </header>

      <AsyncSection
        error={state.error}
        onRetry={() => void state.reload()}
        status={state.status}
      >
        <Card>
          <CardContent className='pt-6'>
            {state.data && state.data.length === 0 ? (
              <p className='py-6 text-center text-sm text-muted-foreground'>
                {t('production.common.empty')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('production.workOrders.code')}</TableHead>
                    <TableHead>{t('production.workOrders.product')}</TableHead>
                    <TableHead>{t('production.workOrders.team')}</TableHead>
                    <TableHead>
                      {t('production.workOrders.processName')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('production.workOrders.defectQuantity')}
                    </TableHead>
                    <TableHead>
                      {t('production.workOrders.defectReason')}
                    </TableHead>
                    <TableHead>
                      {t('production.workOrders.defectDisposition')}
                    </TableHead>
                    <TableHead>
                      {t('production.workOrders.recordedBy')}
                    </TableHead>
                    <TableHead>
                      {t('production.workOrders.reportedAt')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.data?.map((defect) => (
                    <TableRow key={defect.id}>
                      <TableCell className='font-medium'>
                        {defect.workOrderCode}
                      </TableCell>
                      <TableCell>{defect.productName}</TableCell>
                      <TableCell>{defect.teamName}</TableCell>
                      <TableCell>{defect.processName}</TableCell>
                      <TableCell className='text-right'>
                        {defect.quantity}
                      </TableCell>
                      <TableCell>
                        {t(`production.reason.${defect.reason}`, {
                          defaultValue: defect.reason,
                        })}
                      </TableCell>
                      <TableCell>
                        {t(`production.disposition.${defect.disposition}`, {
                          defaultValue: defect.disposition,
                        })}
                      </TableCell>
                      <TableCell>{defect.recordedByName}</TableCell>
                      <TableCell>{formatDateTime(defect.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </AsyncSection>
    </section>
  );
}
