import { appApiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import { SearchIcon } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { listRecords } from '../components/asset/asset-api.js';
import {
  formatDateTime,
  recordStatusKey,
} from '../components/asset/asset-label-utils.js';
import { RecordStatusBadge } from '../components/asset/asset-labels.js';
import {
  RECORD_STATUSES,
  type AssetRecord,
} from '../components/asset/asset-types.js';

export default function AssetRecordsPage(): ReactElement {
  const { t } = useTranslation();
  const appClient = useService(appApiClientToken);

  const [records, setRecords] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const loadRecords = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await listRecords(appClient, {
        status: status || undefined,
        search: search.trim() || undefined,
      });
      setRecords(data);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('assets.recordsLoadError'),
      );
    } finally {
      setLoading(false);
    }
  }, [appClient, search, status, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRecords();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadRecords]);

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-8'>
      <div>
        <h1 className='text-2xl font-semibold tracking-tight'>
          {t('assets.recordsTitle')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('assets.recordsDescription')}
        </p>
      </div>

      <Card>
        <CardHeader className='gap-3'>
          <CardTitle className='text-base'>{t('assets.filters')}</CardTitle>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='relative w-full max-w-64'>
              <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                className='pl-8'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('assets.recordsSearchPlaceholder')}
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('assets.allRecordStatuses')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=''>
                  {t('assets.allRecordStatuses')}
                </SelectItem>
                {RECORD_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(recordStatusKey(value))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
          {loading ? (
            <div className='flex justify-center py-10'>
              <Spinner className='size-6' />
            </div>
          ) : records.length === 0 ? (
            <p className='py-10 text-center text-sm text-muted-foreground'>
              {t('assets.recordsEmpty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('assets.columns.assetNumber')}</TableHead>
                  <TableHead>{t('assets.columns.name')}</TableHead>
                  <TableHead>{t('assets.columns.employee')}</TableHead>
                  <TableHead>{t('assets.columns.department')}</TableHead>
                  <TableHead>{t('assets.columns.claimedAt')}</TableHead>
                  <TableHead>{t('assets.columns.returnedAt')}</TableHead>
                  <TableHead>{t('assets.columns.status')}</TableHead>
                  <TableHead>{t('assets.columns.remark')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className='font-medium'>
                      <Link
                        className='text-primary hover:underline'
                        to={`/it-assets/${record.assetId}`}
                      >
                        {record.assetNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{record.assetName}</TableCell>
                    <TableCell>{record.employeeName}</TableCell>
                    <TableCell>{record.department}</TableCell>
                    <TableCell>{formatDateTime(record.claimedAt)}</TableCell>
                    <TableCell>{formatDateTime(record.returnedAt)}</TableCell>
                    <TableCell>
                      <RecordStatusBadge
                        status={record.status}
                        label={t(recordStatusKey(record.status))}
                      />
                    </TableCell>
                    <TableCell className='max-w-48 truncate'>
                      {record.remark ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
