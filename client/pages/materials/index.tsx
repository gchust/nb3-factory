import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { FolderOpen, Plus } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

import { listMaterials, type Material } from './api';

/** The materials the signed-in user owns. */
export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [materials, setMaterials] = useState<readonly Material[]>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = await listMaterials(api);
        if (!active) return;
        setMaterials(loaded);
        setFailed(false);
      } catch {
        if (!active) return;
        setFailed(true);
        setMaterials([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [api]);

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.title')}
        description={t('materials.description')}
        actions={
          <Button
            render={<Link to='/materials/new' />}
            data-icon='inline-start'
          >
            <Plus aria-hidden='true' />
            {t('materials.new')}
          </Button>
        }
      />
      {failed ? (
        <p role='alert' className='text-sm text-destructive'>
          {t('materials.loadFailed')}
        </p>
      ) : null}
      {materials === undefined ? (
        <Spinner />
      ) : materials.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('materials.empty')}</CardTitle>
            <CardDescription>{t('materials.emptyDescription')}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className='grid gap-4 sm:grid-cols-2'>
          {materials.map((material) => (
            <Card key={material.id}>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <FolderOpen aria-hidden='true' className='size-4' />
                  {material.title}
                </CardTitle>
                <CardDescription>
                  {t('materials.attachmentCount', {
                    count: material.attachments.length,
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant='outline'
                  size='sm'
                  render={<Link to={`/materials/${material.id}`} />}
                >
                  {t('materials.open')}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
