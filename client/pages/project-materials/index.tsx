import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { FileStack, Plus } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { listMaterials } from './api.js';
import { materialCreatePath, materialListBase } from './paths.js';
import type { ProjectMaterial } from './types.js';

export default function ProjectMaterialsPage(): ReactElement {
  const api = useApiClient();
  const toaster = useToaster();
  const { t } = useTranslation();
  const location = useLocation();
  const base = materialListBase(location.pathname);
  const [materials, setMaterials] = useState<readonly ProjectMaterial[]>();
  const [failed, setFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    listMaterials(api)
      .then((data) => {
        if (!active) return;
        setMaterials(data);
        setFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
        toaster.show({
          type: 'error',
          title: t('projectMaterials.loadFailed'),
        });
      });
    return () => {
      active = false;
    };
  }, [api, reloadToken, t, toaster]);

  const reload = (): void => {
    setFailed(false);
    setReloadToken((value) => value + 1);
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('projectMaterials.title')}
        description={t('projectMaterials.description')}
        actions={
          <Button render={<Link to={materialCreatePath(location.pathname)} />}>
            <Plus aria-hidden='true' />
            {t('projectMaterials.new')}
          </Button>
        }
      />
      {failed && materials === undefined ? (
        <div role='alert' className='space-y-3 rounded-md border p-4'>
          <p>{t('projectMaterials.loadFailed')}</p>
          <Button type='button' variant='outline' onClick={reload}>
            {t('projectMaterials.retry')}
          </Button>
        </div>
      ) : materials === undefined ? (
        <div
          role='status'
          className='flex items-center gap-2 text-muted-foreground'
        >
          <Spinner />
          {t('status.loading')}
        </div>
      ) : materials.length === 0 ? (
        <div
          role='status'
          className='rounded-md border border-dashed p-8 text-center text-muted-foreground'
        >
          {t('projectMaterials.empty')}
        </div>
      ) : (
        <ul className='grid gap-3'>
          {materials.map((material) => (
            <li key={material.id}>
              <Link
                to={`${base}/${material.id}`}
                className='flex items-center gap-4 rounded-md border p-4 transition-colors hover:bg-muted/50'
              >
                <span className='flex size-10 shrink-0 items-center justify-center rounded-md bg-muted/50 text-muted-foreground'>
                  <FileStack aria-hidden='true' />
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='block truncate font-medium'>
                    {material.title}
                  </span>
                  <span className='block text-sm text-muted-foreground'>
                    {t('projectMaterials.fileCount', {
                      count: material.files.length,
                    })}
                    {' · '}
                    {t('projectMaterials.createdAt', {
                      date: new Date(material.createdAt).toLocaleDateString(),
                    })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {/* The create page and a record's page render here, covering the list and leaving it mounted. */}
      <Outlet />
    </PageContainer>
  );
}
