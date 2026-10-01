import { useTranslation } from '@nocobase/i18n/client';
import { BotIcon, FileTextIcon, RefreshCwIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { listMaterials, type MaterialDto } from './api.js';

/**
 * Read-only list of the materials the signed-in user may see. The server
 * filters by the user's authorization policy, so a confidential material is
 * never sent to a colleague — the page does not hide it, it never receives it.
 */
export default function MaterialsPage() {
  const { t } = useTranslation();
  const [materials, setMaterials] = useState<MaterialDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setMaterials(await listMaterials());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so the first `setLoading` runs after the effect body, not
    // synchronously inside it; the initial state already shows the loader.
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.title')}
        description={t('materials.description')}
        actions={
          <Button
            variant='outline'
            size='sm'
            render={<Link to='/materials-assistant' />}
          >
            <BotIcon data-icon='inline-start' />
            {t('materials.assistantLink')}
          </Button>
        }
      />

      {loading ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('materials.loading')}
        </p>
      ) : error ? (
        <Card>
          <CardContent className='flex flex-col items-start gap-3 py-6'>
            <p role='alert' className='text-sm text-destructive'>
              {t('materials.loadFailed')}
            </p>
            <Button variant='outline' size='sm' onClick={() => void load()}>
              <RefreshCwIcon data-icon='inline-start' />
              {t('materials.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : materials.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('materials.empty')}</p>
      ) : (
        <div className='grid gap-4'>
          {materials.map((material) => (
            <Card key={material.id}>
              <CardHeader className='gap-2'>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <FileTextIcon className='size-4 text-muted-foreground' />
                  <span>{material.title}</span>
                  <Badge variant='outline' className='ml-auto shrink-0'>
                    #{material.id}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className='whitespace-pre-wrap text-sm leading-6 text-foreground'>
                  {material.content}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
