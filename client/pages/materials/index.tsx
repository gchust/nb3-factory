import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  EyeIcon,
  PlusIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';

import { listMaterials } from './api.js';
import { CreateMaterialDialog } from './material-dialog.js';
import { MaterialDetailSheet } from './material-sheet.js';
import type { Material } from './types.js';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [materials, setMaterials] = useState<readonly Material[]>();
  const [failed, setFailed] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listMaterials(api, controller.signal).then(
      (records) => {
        if (controller.signal.aborted) return;
        setMaterials(records);
        setFailed(false);
      },
      () => {
        if (controller.signal.aborted) return;
        setFailed(true);
        setMaterials(undefined);
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);
  // A new key for every open remounts the create dialog, so its fields start empty each time.
  const openCreate = useCallback(() => {
    setCreateKey((key) => key + 1);
    setCreateOpen(true);
  }, []);

  const columns = useMemo<ColumnDef<Material>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('materials.columns.title')}
          />
        ),
        cell: ({ row }) => (
          <Button
            type='button'
            variant='link'
            className='h-auto p-0 font-medium'
            onClick={() => setSelectedId(row.original.id)}
          >
            {row.original.title}
          </Button>
        ),
      },
      {
        id: 'attachments',
        header: () => t('materials.columns.attachments'),
        cell: ({ row }) => (
          <Badge variant='secondary'>
            {t('materials.fileCount', { count: row.original.files.length })}
          </Badge>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('materials.columns.updated')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {formatDate(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => (
          <span className='sr-only'>{t('materials.columns.actions')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setSelectedId(row.original.id)}
            >
              <EyeIcon aria-hidden='true' />
              {t('materials.open')}
            </Button>
          </div>
        ),
      },
    ],
    [t],
  );

  const open = Boolean(selectedId);

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.title')}
        description={t('materials.description')}
        actions={
          <Button type='button' onClick={openCreate}>
            <PlusIcon aria-hidden='true' />
            {t('materials.new')}
          </Button>
        }
      />
      {failed ? (
        <Alert variant='destructive'>
          <TriangleAlertIcon aria-hidden='true' />
          <AlertDescription>
            {t('materials.errors.loadFailed')}
          </AlertDescription>
          <AlertAction>
            <Button type='button' variant='outline' size='sm' onClick={reload}>
              <RefreshCwIcon aria-hidden='true' />
              {t('status.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : materials === undefined ? (
        <div className='space-y-3'>
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-32 w-full' />
        </div>
      ) : materials.length === 0 ? (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t('materials.emptyTitle')}</EmptyTitle>
                <EmptyDescription>
                  {t('materials.emptyDescription')}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button type='button' onClick={openCreate}>
                  <PlusIcon aria-hidden='true' />
                  {t('materials.new')}
                </Button>
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={[...materials]}
          getRowId={(row) => row.id}
        />
      )}
      <CreateMaterialDialog
        key={createKey}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={reload}
      />
      <MaterialDetailSheet
        materialId={open ? selectedId : null}
        onOpenChange={(next) => {
          if (!next) setSelectedId(null);
        }}
        onChanged={reload}
        onDeleted={reload}
      />
    </PageContainer>
  );
}
