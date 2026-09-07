import { appApiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeftIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  claimAsset,
  getAsset,
  listEmployees,
  listRecords,
  returnAsset,
} from '../components/asset/asset-api.js';
import {
  assetStatusKey,
  assetTypeKey,
  formatDateTime,
  recordStatusKey,
} from '../components/asset/asset-label-utils.js';
import {
  AssetStatusBadge,
  RecordStatusBadge,
} from '../components/asset/asset-labels.js';
import type {
  Asset,
  AssetRecord,
  Employee,
} from '../components/asset/asset-types.js';
import {
  ClaimDialog,
  ReturnDialog,
} from '../components/asset/asset-action-dialogs.js';

export default function AssetDetailPage(): ReactElement {
  const { t } = useTranslation();
  const appClient = useService(appApiClientToken);
  const params = useParams<{ id: string }>();
  const assetId = Number(params.id);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [records, setRecords] = useState<AssetRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [returning, setReturning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      if (!Number.isInteger(assetId) || assetId <= 0) {
        throw new Error(t('assets.notFound'));
      }
      const [assetData, recordData] = await Promise.all([
        getAsset(appClient, assetId),
        listRecords(appClient, { assetId: String(assetId) }),
      ]);
      setAsset(assetData);
      setRecords(recordData);
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('assets.notFound'),
      );
    } finally {
      setLoading(false);
    }
  }, [appClient, assetId, t]);

  useEffect(() => {
    // Defer the initial load so the effect does not synchronously set state.
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    void listEmployees(appClient)
      .then(setEmployees)
      .catch(() => {
        // The employee list only drives the claim dialog.
      });
  }, [appClient]);

  async function handleClaim(
    employeeId: number,
    remark: string | null,
  ): Promise<void> {
    if (!asset) {
      return;
    }
    setSubmitting(true);
    try {
      await claimAsset(appClient, asset.id, employeeId, remark);
      setClaiming(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReturn(remark: string | null): Promise<void> {
    if (!asset) {
      return;
    }
    setSubmitting(true);
    try {
      await returnAsset(appClient, asset.id, remark);
      setReturning(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className='mx-auto w-full max-w-4xl px-6 py-8'>
        <div className='flex justify-center py-16'>
          <Spinner className='size-6' />
        </div>
      </section>
    );
  }

  if (error || !asset) {
    return (
      <section className='mx-auto w-full max-w-4xl space-y-4 px-6 py-8'>
        <p className='text-sm text-destructive'>
          {error ?? t('assets.notFound')}
        </p>
        <Button
          variant='outline'
          nativeButton={false}
          render={<Link to='/it-assets' />}
        >
          <ArrowLeftIcon />
          {t('assets.back')}
        </Button>
      </section>
    );
  }

  return (
    <section className='mx-auto w-full max-w-4xl space-y-6 px-6 py-8'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-3'>
          <Button
            size='icon-sm'
            variant='ghost'
            nativeButton={false}
            render={<Link to='/it-assets' aria-label={t('assets.back')} />}
          >
            <ArrowLeftIcon />
          </Button>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight'>
              {asset.name}
            </h1>
            <p className='text-sm text-muted-foreground'>{asset.assetNumber}</p>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          {asset.status === 'available' ? (
            <Button onClick={() => setClaiming(true)}>
              {t('assets.claim')}
            </Button>
          ) : null}
          {asset.status === 'inUse' ? (
            <Button onClick={() => setReturning(true)}>
              {t('assets.return')}
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>{t('assets.detailTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className='grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2'>
            <div>
              <dt className='text-sm text-muted-foreground'>
                {t('assets.columns.assetNumber')}
              </dt>
              <dd className='text-sm font-medium'>{asset.assetNumber}</dd>
            </div>
            <div>
              <dt className='text-sm text-muted-foreground'>
                {t('assets.columns.type')}
              </dt>
              <dd className='text-sm font-medium'>
                {t(assetTypeKey(asset.type))}
              </dd>
            </div>
            <div>
              <dt className='text-sm text-muted-foreground'>
                {t('assets.columns.brandModel')}
              </dt>
              <dd className='text-sm font-medium'>{asset.brandModel}</dd>
            </div>
            <div>
              <dt className='text-sm text-muted-foreground'>
                {t('assets.columns.status')}
              </dt>
              <dd>
                <AssetStatusBadge
                  status={asset.status}
                  label={t(assetStatusKey(asset.status))}
                />
              </dd>
            </div>
            <div>
              <dt className='text-sm text-muted-foreground'>
                {t('assets.currentHolder')}
              </dt>
              <dd className='text-sm font-medium'>
                {asset.currentEmployeeName ?? '—'}
              </dd>
            </div>
            <div>
              <dt className='text-sm text-muted-foreground'>
                {t('assets.columns.purchasedAt')}
              </dt>
              <dd className='text-sm font-medium'>
                {formatDateTime(asset.purchasedAt)}
              </dd>
            </div>
            <div className='sm:col-span-2'>
              <dt className='text-sm text-muted-foreground'>
                {t('assets.columns.remark')}
              </dt>
              <dd className='text-sm font-medium'>{asset.remark ?? '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>{t('assets.history')}</CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className='py-6 text-center text-sm text-muted-foreground'>
              {t('assets.noHistory')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
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
                      {record.employeeName}
                    </TableCell>
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

      <ClaimDialog
        open={claiming}
        asset={asset}
        employees={employees}
        submitting={submitting}
        onOpenChange={setClaiming}
        onSubmit={handleClaim}
      />
      <ReturnDialog
        open={returning}
        asset={asset}
        submitting={submitting}
        onOpenChange={setReturning}
        onSubmit={handleReturn}
      />
    </section>
  );
}
