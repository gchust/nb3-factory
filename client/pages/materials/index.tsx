import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { FileText, ImageIcon, Plus } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/loading';

import { listMaterials, type Material } from './types.js';

/** The materials a signed-in user owns, with a child route covering the list for create and detail. */
export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const [materials, setMaterials] = useState<Material[]>();
  const [error, setError] = useState<string>();
  const listVisible = /^\/materials\/?$/.test(location.pathname);

  // The list stays mounted under a covering child route, so it reloads whenever the user comes back to it.
  useEffect(() => {
    if (!listVisible) return;
    const controller = new AbortController();
    void listMaterials(api, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setMaterials(items);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : 'materials.loadFailed',
        );
      });
    return () => controller.abort();
  }, [api, listVisible]);

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button render={<Link to='new' />}>
            <Plus aria-hidden='true' />
            {t('materials.new')}
          </Button>
        }
        description={t('materials.description')}
        title={t('materials.title')}
      />

      {error ? (
        <p
          className='rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive'
          role='alert'
        >
          {t(error, { defaultValue: error })}
        </p>
      ) : null}

      {!materials && !error ? <Loading /> : null}

      {materials ? (
        materials.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('materials.empty')}
          </p>
        ) : (
          <ul className='space-y-3'>
            {materials.map((material) => (
              <li key={material.id}>
                <Link
                  className='flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent'
                  to={String(material.id)}
                >
                  <div className='min-w-0'>
                    <p className='truncate font-medium'>{material.title}</p>
                    <p className='mt-1 text-sm text-muted-foreground'>
                      {t('materials.attachments')}: {material.files.length}
                    </p>
                  </div>
                  <div className='flex shrink-0 items-center gap-1 text-muted-foreground'>
                    {material.files.some((file) =>
                      file.mimeType.startsWith('image/'),
                    ) ? (
                      <ImageIcon aria-hidden='true' className='size-4' />
                    ) : null}
                    {material.files.length > 0 ? (
                      <FileText aria-hidden='true' className='size-4' />
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}

      <Outlet />
    </PageContainer>
  );
}
