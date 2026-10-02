import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, FolderPlusIcon, PaperclipIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  listMaterials,
  materialErrorCode,
  materialErrorKey,
  type Material,
} from './api.js';

export default function MaterialsPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const [materials, setMaterials] = useState<readonly Material[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [errorKey, setErrorKey] = useState<string>('materials.errors.unknown');

  const load = useCallback(async (): Promise<void> => {
    setStatus('loading');
    try {
      setMaterials(await listMaterials(api));
      setStatus('ready');
    } catch (error) {
      setErrorKey(materialErrorKey(materialErrorCode(error)));
      setStatus('error');
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const formatDate = (value: string): string => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(date);
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.list.title')}
        description={t('materials.list.description')}
        actions={
          <Button render={<Link to='/materials/new' />}>
            <FolderPlusIcon data-icon='inline-start' />
            {t('materials.list.new')}
          </Button>
        }
      />

      {status === 'loading' ? (
        <div className='flex justify-center py-16'>
          <Loading label={t('materials.list.loading')} />
        </div>
      ) : null}

      {status === 'error' ? (
        <Alert variant='destructive'>
          <AlertCircleIcon aria-hidden='true' />
          <AlertDescription className='flex flex-col gap-3'>
            <span>{t(errorKey)}</span>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='self-start'
              onClick={() => void load()}
            >
              {t('materials.list.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {status === 'ready' && materials.length === 0 ? (
        <Empty className='rounded-lg border border-dashed'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <PaperclipIcon aria-hidden='true' />
            </EmptyMedia>
            <EmptyTitle>{t('materials.list.emptyTitle')}</EmptyTitle>
            <EmptyDescription>
              {t('materials.list.emptyDescription')}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link to='/materials/new' />}>
              <FolderPlusIcon data-icon='inline-start' />
              {t('materials.list.new')}
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}

      {status === 'ready' && materials.length > 0 ? (
        <ul className='grid gap-4 md:grid-cols-2'>
          {materials.map((material) => (
            <li key={material.id}>
              <Card className='h-full transition-colors hover:border-ring/60'>
                <CardHeader>
                  <CardTitle className='min-w-0'>
                    <Button
                      variant='link'
                      className='h-auto max-w-full justify-start truncate p-0 text-base'
                      render={<Link to={`/materials/${material.id}`} />}
                    >
                      {material.title}
                    </Button>
                  </CardTitle>
                  <CardDescription>
                    {t('materials.list.createdAt', {
                      date: formatDate(material.createdAt),
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant='secondary'>
                    <PaperclipIcon data-icon='inline-start' />
                    {t('materials.list.fileCount', {
                      count: material.files.length,
                    })}
                  </Badge>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </PageContainer>
  );
}