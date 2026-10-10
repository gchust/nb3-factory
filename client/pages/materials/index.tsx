import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { MaterialBadges } from './badges.js';
import { MaterialFormDialog } from './material-form-dialog.js';
import { fetchMaterials } from './materials-api.js';
import type { MaterialListResult } from './types.js';

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** The document library: every document the signed-in user may read. */
export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = reloadCount;
  const [result, setResult] = useState<{
    readonly key: number;
    readonly list?: MaterialListResult;
    readonly error?: unknown;
  }>();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchMaterials(api, undefined, controller.signal).then(
      (list) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, list });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const list = result?.list;

  function reload(): void {
    setReloadCount((count) => count + 1);
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.title')}
        description={t('materials.description')}
        actions={
          !loading && !error && list?.meta.canCreate ? (
            <Button type='button' onClick={() => setCreating(true)}>
              <Plus aria-hidden='true' />
              {t('materials.create')}
            </Button>
          ) : null
        }
      />

      {loading ? (
        <div className='flex items-center gap-2 text-muted-foreground'>
          <Spinner />
          {t('status.loading')}
        </div>
      ) : null}

      {error ? (
        <div className='space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4'>
          <div>
            <p className='font-medium'>{t('materials.error.title')}</p>
            <p className='text-sm text-muted-foreground'>
              {t('materials.error.description')}
            </p>
          </div>
          <Button type='button' variant='outline' onClick={reload}>
            {t('status.retry')}
          </Button>
        </div>
      ) : null}

      {!loading && !error && list && list.data.length === 0 ? (
        <div className='rounded-lg border border-dashed border-border p-8 text-center'>
          <p className='font-medium'>{t('materials.empty')}</p>
          <p className='mt-1 text-sm text-muted-foreground'>
            {t('materials.emptyDescription')}
          </p>
        </div>
      ) : null}

      {!loading && !error && list && list.data.length > 0 ? (
        <div className='overflow-x-auto rounded-lg border border-border'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 text-left text-muted-foreground'>
              <tr>
                <th className='px-4 py-3 font-medium'>
                  {t('materials.column.title')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('materials.column.owner')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('materials.column.status')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('materials.column.updatedAt')}
                </th>
              </tr>
            </thead>
            <tbody className='divide-y divide-border'>
              {list.data.map((material) => (
                <tr key={material.id} className='hover:bg-muted/50'>
                  <td className='px-4 py-3'>
                    <Link
                      to={`/materials/${encodeURIComponent(material.id)}`}
                      className='font-medium text-primary underline-offset-4 hover:underline'
                    >
                      {material.title}
                    </Link>
                  </td>
                  <td className='px-4 py-3'>{material.ownerName}</td>
                  <td className='px-4 py-3'>
                    <MaterialBadges material={material} />
                  </td>
                  <td className='px-4 py-3 text-muted-foreground'>
                    {formatDate(material.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {creating ? (
        <MaterialFormDialog
          onOpenChange={setCreating}
          onSaved={() => reload()}
        />
      ) : null}
    </PageContainer>
  );
}
