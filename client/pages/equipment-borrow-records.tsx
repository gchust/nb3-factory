import { useTranslation } from '@nocobase/i18n/client';
import { Loader2, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { toast } from 'sonner';

import { describeError, useAppApiClient } from '@/components/equipment/api.js';
import type { BorrowRecordItem } from '@/components/equipment/types.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function BorrowRecordsPage(): ReactElement {
  const { t } = useTranslation();
  const appClient = useAppApiClient();
  const [records, setRecords] = useState<BorrowRecordItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await appClient.request<{
        data: BorrowRecordItem[];
      }>('equipment-borrow-records');
      setRecords(payload.data);
    } catch (caught) {
      setError(describeError(caught).message);
    } finally {
      setIsLoading(false);
    }
  }, [appClient]);

  useEffect(() => {
    let active = true;
    void (async (): Promise<void> => {
      try {
        const payload = await appClient.request<{
          data: BorrowRecordItem[];
        }>('equipment-borrow-records');
        if (active) setRecords(payload.data);
      } catch (caught) {
        if (active) setError(describeError(caught).message);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [appClient]);

  const returnRecord = async (record: BorrowRecordItem): Promise<void> => {
    setBusyId(record.id);
    try {
      await appClient.request(`equipment-borrow-records/${record.id}/return`, {
        body: '{}',
        method: 'POST',
      });
      toast.success(t('equipment.toasts.returned'));
      await reload();
    } catch (caught) {
      toast.error(
        describeError(caught).message || t('equipment.errors.returnFailed'),
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className='mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6'>
      <Card>
        <CardHeader>
          <CardTitle>{t('equipment.records.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('equipment.fields.name')}</TableHead>
                <TableHead>{t('equipment.fields.assetNumber')}</TableHead>
                <TableHead>{t('equipment.fields.borrower')}</TableHead>
                <TableHead>{t('equipment.fields.borrowedAt')}</TableHead>
                <TableHead>{t('equipment.fields.returnedAt')}</TableHead>
                <TableHead>{t('equipment.fields.note')}</TableHead>
                <TableHead>{t('equipment.fields.state')}</TableHead>
                <TableHead className='text-right'>
                  {t('equipment.fields.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    className='h-24 text-center text-muted-foreground'
                    colSpan={8}
                  >
                    <Loader2 className='mx-auto animate-spin' />
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell
                    className='h-24 text-center text-muted-foreground'
                    colSpan={8}
                  >
                    {t('equipment.records.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className='font-medium'>
                      {record.equipmentName ?? record.equipmentId}
                    </TableCell>
                    <TableCell>{record.assetNumber ?? '—'}</TableCell>
                    <TableCell>
                      {record.borrowerName || record.borrowerId}
                    </TableCell>
                    <TableCell>{formatDateTime(record.borrowedAt)}</TableCell>
                    <TableCell>{formatDateTime(record.returnedAt)}</TableCell>
                    <TableCell className='max-w-48 truncate whitespace-normal'>
                      {record.note ?? '—'}
                    </TableCell>
                    <TableCell>
                      {record.returnedAt ? (
                        <Badge variant='secondary'>
                          {t('equipment.recordState.returned')}
                        </Badge>
                      ) : (
                        <Badge className='bg-amber-500/15 text-amber-700 dark:text-amber-400'>
                          {t('equipment.recordState.open')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className='text-right'>
                      {record.canReturn && !record.returnedAt ? (
                        <Button
                          disabled={busyId === record.id}
                          onClick={() => void returnRecord(record)}
                          size='sm'
                          variant='outline'
                        >
                          <RotateCcw />
                          {t('equipment.actions.return')}
                        </Button>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
