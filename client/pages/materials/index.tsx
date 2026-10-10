import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { fetchMaterials } from './materials-api.js';
import {
  MATERIALS_PAGE_SIZE,
  type Material,
  type MaterialsOutletContext,
} from './types.js';

/**
 * The materials list: the signed-in user's own materials, newest first.
 *
 * It is also the parent route of the create dialog and the detail drawer, and
 * hands both a `reload` through `<Outlet context>` so a save or a delete made
 * in a child route refreshes the list behind it.
 */
export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    readonly key: number;
    readonly materials?: readonly Material[];
    readonly error?: unknown;
  }>();
  const reload = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const key = revision;
    fetchMaterials(api, {
      page: 1,
      pageSize: MATERIALS_PAGE_SIZE,
      signal: controller.signal,
    }).then(
      (data) => {
        if (!controller.signal.aborted)
          setResult({ key, materials: data.data });
      },
      (cause: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error: cause });
      },
    );
    return () => controller.abort();
  }, [api, revision]);

  const loading = result?.key !== revision;
  const materials = loading ? undefined : result?.materials;
  const error = loading ? undefined : result?.error;

  const status = error instanceof ApiClientError ? error.status : undefined;
  let body: ReactElement;
  if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertDescription role='alert'>
          {status === 401
            ? t('materials.error.sessionExpired')
            : t('materials.loadFailed')}
        </AlertDescription>
        {status === 401 ? null : (
          <Button variant='outline' size='sm' onClick={reload}>
            {t('status.retry')}
          </Button>
        )}
      </Alert>
    );
  } else if (!materials) {
    body = (
      <div
        role='status'
        className='flex items-center gap-2 text-muted-foreground'
      >
        <Spinner aria-hidden='true' />
        {t('status.loading')}
      </div>
    );
  } else if (!materials.length) {
    body = (
      <div className='rounded-lg border border-dashed p-8 text-center'>
        <p className='font-medium'>{t('materials.emptyTitle')}</p>
        <p className='mt-1 text-sm text-muted-foreground'>
          {t('materials.emptyDescription')}
        </p>
      </div>
    );
  } else {
    body = (
      <ul className='grid gap-3 sm:grid-cols-2'>
        {materials.map((material) => (
          <li key={material.id}>
            <Link
              className='block rounded-lg border p-4 transition-colors hover:bg-muted/50'
              to={material.id}
            >
              <span className='block truncate font-medium'>
                {material.title}
              </span>
              <span className='mt-1 block text-sm text-muted-foreground'>
                {t('materials.attachmentCount', {
                  count: material.files.length,
                })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  const context: MaterialsOutletContext = { reload };

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.title')}
        description={t('materials.description')}
        actions={
          <Button nativeButton={false} render={<Link to='new' />}>
            <Plus aria-hidden='true' />
            {t('materials.new')}
          </Button>
        }
      />
      {body}
      <Outlet context={context} />
    </PageContainer>
  );
}
