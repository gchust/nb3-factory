import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useProjectMaterialsApi, type ProjectMaterialView } from './api.js';

type ListState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly materials: ProjectMaterialView[] };

export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const api = useProjectMaterialsApi();
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await api.list();
        if (controller.signal.aborted) return;
        setState({ status: 'ready', materials: response.data });
      } catch {
        if (controller.signal.aborted) return;
        setState({ status: 'error' });
      }
    })();
    return () => controller.abort();
  }, [api, reloadToken]);

  return (
    <PageContainer>
      <Breadcrumbs />
      <PageHeader
        title={t('materials.title')}
        description={t('materials.description')}
        actions={
          <Button
            nativeButton={false}
            render={
              <Link
                to={{ pathname: 'new', search: location.search }}
                aria-label={t('materials.create.action')}
              />
            }
          >
            <PlusIcon data-icon='inline-start' />
            {t('materials.create.action')}
          </Button>
        }
      />

      {state.status === 'loading' ? (
        <div className='space-y-3' role='status'>
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
        </div>
      ) : null}

      {state.status === 'error' ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('materials.errors.loadFailed')}</AlertTitle>
          <AlertDescription>
            <div className='flex flex-col items-start gap-3'>
              <span>{t('materials.errors.loadFailedHint')}</span>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => {
                  setState({ status: 'loading' });
                  setReloadToken((token) => token + 1);
                }}
              >
                {t('status.retry')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {state.status === 'ready' && state.materials.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('materials.empty.title')}</EmptyTitle>
            <EmptyDescription>
              {t('materials.empty.description')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {state.status === 'ready' && state.materials.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('materials.columns.title')}</TableHead>
              <TableHead>{t('materials.columns.attachments')}</TableHead>
              <TableHead>{t('materials.columns.updatedAt')}</TableHead>
              <TableHead className='text-right'>
                {t('materials.columns.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.materials.map((material) => (
              <TableRow key={material.id}>
                <TableCell className='font-medium'>
                  <Link
                    className='hover:underline'
                    to={{
                      pathname: String(material.id),
                      search: location.search,
                    }}
                  >
                    {material.title}
                  </Link>
                </TableCell>
                <TableCell>{material.attachments.length}</TableCell>
                <TableCell className='text-muted-foreground'>
                  {new Date(material.updatedAt).toLocaleString()}
                </TableCell>
                <TableCell className='text-right'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() =>
                      void navigate({
                        pathname: String(material.id),
                        search: location.search,
                      })
                    }
                  >
                    {t('materials.view')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <Outlet />
    </PageContainer>
  );
}
