import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, type ReactElement } from 'react';

import {
  EmptyLine,
  ErrorLine,
  LoadingLine,
  ProcurementCard,
  ProcurementPage,
} from '@/components/procurement/page-shell';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatMoney,
  useLoaded,
  useProcurementApi,
} from '@/lib/procurement-api';

export default function StatisticsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useProcurementApi();
  const loader = useCallback(() => api.statistics(), [api]);
  const { data, loading, error } = useLoaded(loader);

  return (
    <ProcurementPage title={t('procurement.statistics.title')}>
      {loading ? <LoadingLine /> : null}
      {error ? <ErrorLine message={error} /> : null}
      {data ? (
        <>
          <ProcurementCard title={t('procurement.statistics.pendingApproval')}>
            <p className='font-heading text-3xl font-semibold tabular-nums'>
              {data.pendingApprovalCount}
            </p>
          </ProcurementCard>

          <ProcurementCard title={t('procurement.statistics.bySupplier')}>
            {data.bySupplier.length === 0 ? <EmptyLine /> : null}
            {data.bySupplier.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {t('procurement.statistics.supplier')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('procurement.statistics.total')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.bySupplier.map((row) => (
                    <TableRow key={row.supplierId}>
                      <TableCell>
                        {row.supplierName || row.supplierId}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {formatMoney(row.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </ProcurementCard>

          <ProcurementCard title={t('procurement.statistics.byMonth')}>
            {data.byMonth.length === 0 ? <EmptyLine /> : null}
            {data.byMonth.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('procurement.statistics.month')}</TableHead>
                    <TableHead className='text-right'>
                      {t('procurement.statistics.total')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byMonth.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell>{row.month}</TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {formatMoney(row.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </ProcurementCard>
        </>
      ) : null}
    </ProcurementPage>
  );
}
