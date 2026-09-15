import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { errorCode, fetchStats } from '@/components/document-library/api.js';
import { errorDescriptor } from '@/components/document-library/messages.js';
import {
  FALLBACK_CAPABILITIES,
  formatBytes,
} from '@/components/document-library/types.js';

export default function DocumentStatsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);

  const statsQuery = useQuery({
    queryKey: ['document-library', 'stats'],
    queryFn: () => fetchStats(api),
    retry: false,
  });
  const stats = statsQuery.data;
  const errorKey = statsQuery.isError
    ? (errorCode(statsQuery.error) ?? 'generic')
    : undefined;
  const descriptor = errorDescriptor(errorKey, FALLBACK_CAPABILITIES);

  return (
    <section className='mx-auto w-full max-w-4xl space-y-6 p-6'>
      <header className='space-y-1'>
        <h1 className='text-2xl font-semibold'>{t('documents.stats.title')}</h1>
        <p className='text-sm text-muted-foreground'>
          {t('documents.stats.subtitle')}
        </p>
      </header>

      {errorKey ? (
        <p role='alert' className='text-sm text-destructive'>
          {t(descriptor.key, descriptor.options)}
        </p>
      ) : null}

      {stats ? (
        stats.groups.length === 0 ? (
          <p role='status' className='text-sm text-muted-foreground'>
            {t('documents.stats.empty')}
          </p>
        ) : (
          <div className='overflow-x-auto rounded-lg border border-border'>
            <table className='w-full border-collapse text-sm'>
              <thead className='bg-muted/40 text-left'>
                <tr>
                  <th className='p-2'>{t('documents.stats.discipline')}</th>
                  <th className='p-2'>{t('documents.stats.count')}</th>
                  <th className='p-2'>{t('documents.stats.totalSize')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.groups.map((group) => (
                  <tr key={group.discipline} className='border-t border-border'>
                    <td className='p-2'>
                      {t(`documents.discipline.${group.discipline}`, {
                        defaultValue: group.discipline,
                      })}
                    </td>
                    <td className='p-2'>{group.count}</td>
                    <td className='p-2'>{formatBytes(group.totalSize)}</td>
                  </tr>
                ))}
                <tr className='border-t border-border font-medium'>
                  <td className='p-2'>{t('documents.stats.total')}</td>
                  <td className='p-2'>{stats.total.count}</td>
                  <td className='p-2'>{formatBytes(stats.total.totalSize)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      ) : !errorKey ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('documents.stats.loading')}
        </p>
      ) : null}
    </section>
  );
}
