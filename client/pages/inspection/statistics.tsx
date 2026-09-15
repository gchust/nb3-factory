import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useInspectionApi } from '../../components/inspection/api.js';
import type { DeviceStat } from '../../components/inspection/types.js';

export default function StatisticsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useInspectionApi();
  const [stats, setStats] = useState<readonly DeviceStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .stats()
      .then((list) => {
        if (active) {
          setStats(list);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);

  return (
    <section className='space-y-6 p-6'>
      <header>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('inspection.stats.title')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('inspection.stats.subtitle')}
        </p>
      </header>

      <Card>
        <CardContent className='pt-6'>
          {loading ? (
            <p className='text-sm text-muted-foreground'>
              {t('inspection.stats.loading')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inspection.stats.code')}</TableHead>
                  <TableHead>{t('inspection.stats.device')}</TableHead>
                  <TableHead className='text-right'>
                    {t('inspection.stats.inspections')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('inspection.stats.abnormals')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.map((row) => (
                  <TableRow key={row.deviceId}>
                    <TableCell className='font-medium'>{row.code}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className='text-right'>
                      {row.inspections}
                    </TableCell>
                    <TableCell className='text-right'>
                      {row.abnormals}
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
