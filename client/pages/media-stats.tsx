import {
  apiClientToken,
  ApiClientError,
  useService,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Loader2 } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { AssetTypeBadge } from '@/components/media/asset-badges';
import { fetchStats, formatSize, type AssetStats } from '@/lib/media';

export default function MediaStatsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const [stats, setStats] = useState<AssetStats>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    fetchStats(api)
      .then((value) => {
        if (active) setStats(value);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof ApiClientError
              ? cause.message
              : t('media.stats.loadFailed', {
                  defaultValue: 'Unable to load the statistics.',
                }),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, t]);

  return (
    <section className='mx-auto max-w-3xl space-y-6 p-6'>
      <header className='space-y-1'>
        <h1 className='font-heading text-2xl font-semibold'>
          {t('media.stats.title')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('media.stats.description')}
        </p>
      </header>

      {error ? (
        <p
          role='alert'
          className='rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 className='animate-spin' aria-hidden='true' />
          {t('media.stats.loading')}
        </div>
      ) : stats ? (
        <>
          <div className='grid gap-4 sm:grid-cols-2'>
            <SummaryCard
              label={t('media.stats.totalAssets')}
              value={String(stats.totalCount)}
            />
            <SummaryCard
              label={t('media.stats.totalSize')}
              value={formatSize(stats.totalSize)}
            />
          </div>
          <div className='overflow-hidden rounded-xl border bg-card'>
            <table className='w-full text-left text-sm'>
              <thead className='border-b bg-muted/30 text-xs tracking-wide text-muted-foreground uppercase'>
                <tr>
                  <th className='px-4 py-3 font-medium'>
                    {t('media.fields.type')}
                  </th>
                  <th className='px-4 py-3 font-medium'>
                    {t('media.stats.count')}
                  </th>
                  <th className='px-4 py-3 font-medium'>
                    {t('media.stats.volume')}
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y'>
                {stats.items.map((entry) => (
                  <tr
                    key={entry.type}
                    data-testid={`media-stats-${entry.type}`}
                  >
                    <td className='px-4 py-3'>
                      <AssetTypeBadge type={entry.type} />
                    </td>
                    <td className='px-4 py-3 tabular-nums'>{entry.count}</td>
                    <td className='px-4 py-3 tabular-nums'>
                      {formatSize(entry.totalSize)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className='border-t bg-muted/20'>
                <tr>
                  <td className='px-4 py-3 font-medium'>
                    {t('media.stats.total')}
                  </td>
                  <td
                    className='px-4 py-3 tabular-nums'
                    data-testid='media-stats-total-count'
                  >
                    {stats.totalCount}
                  </td>
                  <td
                    className='px-4 py-3 tabular-nums'
                    data-testid='media-stats-total-size'
                  >
                    {formatSize(stats.totalSize)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}

function SummaryCard({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='rounded-xl border bg-card p-5'>
      <p className='text-sm text-muted-foreground'>{label}</p>
      <p className='mt-1 font-heading text-2xl font-semibold'>{value}</p>
    </div>
  );
}
