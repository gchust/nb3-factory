import { useTranslation } from '@nocobase/i18n/client';
import { useGetIdentity } from '@refinedev/core';
import { Archive, History, Loader2, Wrench } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { describeError, useAppApiClient } from '@/components/equipment/api.js';
import type {
  BorrowRecordItem,
  EquipmentListItem,
} from '@/components/equipment/types.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AppIdentity {
  email?: string;
  fullName?: string;
  id: string | number;
}

const SKELETON_KEYS = ['a', 'b', 'c', 'd'] as const;

interface DashboardStats {
  readonly total: number;
  readonly available: number;
  readonly borrowed: number;
  readonly repairing: number;
  readonly activeBorrows: number;
}

function countStats(
  equipment: readonly EquipmentListItem[],
  records: readonly BorrowRecordItem[],
): DashboardStats {
  return {
    total: equipment.length,
    available: equipment.filter((item) => item.status === 'available').length,
    borrowed: equipment.filter((item) => item.status === 'borrowed').length,
    repairing: equipment.filter((item) => item.status === 'repairing').length,
    activeBorrows: records.filter((record) => record.returnedAt === null)
      .length,
  };
}

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const { data: identity } = useGetIdentity<AppIdentity>();
  const appClient = useAppApiClient();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async (): Promise<void> => {
      try {
        const [equipmentPayload, recordsPayload] = await Promise.all([
          appClient.request<{ data: EquipmentListItem[] }>('equipment'),
          appClient.request<{ data: BorrowRecordItem[] }>(
            'equipment-borrow-records',
          ),
        ]);
        if (active)
          setStats(countStats(equipmentPayload.data, recordsPayload.data));
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

  const greeting = identity?.fullName ?? identity?.email;

  return (
    <section className='mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6'>
      <div className='space-y-2'>
        <h2 className='text-2xl font-semibold tracking-tight'>
          {t('equipment.home.title')}
        </h2>
        <p className='text-muted-foreground'>
          {greeting ? `${greeting} — ` : ''}
          {t('equipment.home.description')}
        </p>
      </div>

      {isLoading ? (
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          {SKELETON_KEYS.map((key) => (
            <Card key={key}>
              <CardContent className='flex h-28 items-center justify-center'>
                <Loader2 className='animate-spin text-muted-foreground' />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <p className='text-sm text-destructive'>{error}</p>
      ) : stats ? (
        <>
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
                  <Archive className='size-4' />
                  {t('equipment.home.stats.total')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className='text-3xl font-semibold'>{stats.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
                  <span className='size-2 rounded-full bg-emerald-500' />
                  {t('equipment.home.stats.available')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className='text-3xl font-semibold text-emerald-600 dark:text-emerald-400'>
                  {stats.available}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
                  <span className='size-2 rounded-full bg-amber-500' />
                  {t('equipment.home.stats.borrowed')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className='text-3xl font-semibold text-amber-600 dark:text-amber-400'>
                  {stats.borrowed}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
                  <Wrench className='size-4 text-rose-500' />
                  {t('equipment.home.stats.repairing')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className='text-3xl font-semibold text-rose-600 dark:text-rose-400'>
                  {stats.repairing}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className='grid gap-4 md:grid-cols-2'>
            <Card>
              <CardContent className='p-6'>
                <p className='text-sm text-muted-foreground'>
                  {t('equipment.home.stats.activeBorrows')}
                </p>
                <p className='mt-1 text-3xl font-semibold'>
                  {stats.activeBorrows}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className='flex h-full flex-col justify-center gap-2 p-6'>
                <Link
                  className='inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline'
                  to='/equipment'
                >
                  <Archive className='size-4' />
                  {t('equipment.home.browseEquipment')}
                </Link>
                <Link
                  className='inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline'
                  to='/equipment/borrow-records'
                >
                  <History className='size-4' />
                  {t('equipment.home.viewBorrowRecords')}
                </Link>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </section>
  );
}
