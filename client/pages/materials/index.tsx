import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { FileText, Images, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { deleteMaterial, listMaterials } from './material-api.js';
import { MaterialDetailDialog } from './material-detail.js';
import { MaterialFormDialog } from './material-form.js';
import type { Material } from './types.js';

/**
 * The materials page: the owner's saved materials and their private attachments.
 *
 * One route owns the whole feature — list, create, detail and edit — and the surfaces are ordinary dialogs rather
 * than child routes. A material is a single screen with a single save, so nothing here needs a URL of its own; the
 * API scopes every read to the signed-in user, which is what makes the data private rather than the route.
 */
export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const [materials, setMaterials] = useState<readonly Material[]>();
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Material>();
  const [editTarget, setEditTarget] = useState<Material>();
  const [deleteTarget, setDeleteTarget] = useState<Material>();
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    listMaterials(api)
      .then((list) => {
        if (!active) return;
        setMaterials(list);
        setLoadError(false);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [api, reloadToken]);

  const upsert = useCallback((saved: Material): void => {
    setMaterials((current) => {
      const list = current ?? [];
      return list.some((material) => material.id === saved.id)
        ? list.map((material) => (material.id === saved.id ? saved : material))
        : [saved, ...list];
    });
  }, []);

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMaterial(api, deleteTarget.id);
      setMaterials((current) =>
        (current ?? []).filter((material) => material.id !== deleteTarget.id),
      );
      setDeleting(false);
      setDeleteTarget(undefined);
      setDetail(undefined);
      toaster.show({ type: 'success', title: t('materials.deleted') });
    } catch (cause) {
      setDeleting(false);
      toaster.show({
        type: 'error',
        title: t('materials.deleteFailed'),
        description: cause instanceof Error ? cause.message : undefined,
      });
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.title')}
        description={t('materials.description')}
        actions={
          <Button type='button' onClick={() => setCreateOpen(true)}>
            <Plus data-icon='inline-start' />
            {t('materials.newAction')}
          </Button>
        }
      />

      {loadError ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('materials.loadFailedTitle')}</AlertTitle>
          <AlertDescription className='space-y-3'>
            <p>{t('materials.loadFailedDescription')}</p>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setReloadToken((token) => token + 1)}
            >
              {t('materials.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {materials === undefined && !loadError ? (
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
          <Skeleton className='h-32' />
          <Skeleton className='h-32' />
          <Skeleton className='h-32' />
        </div>
      ) : null}

      {materials !== undefined && materials.length === 0 ? (
        <Empty className='rounded-lg border'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Images aria-hidden='true' />
            </EmptyMedia>
            <EmptyTitle>{t('materials.emptyTitle')}</EmptyTitle>
            <EmptyDescription>
              {t('materials.emptyDescription')}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type='button' onClick={() => setCreateOpen(true)}>
              <Plus data-icon='inline-start' />
              {t('materials.newAction')}
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}

      {materials && materials.length > 0 ? (
        <ul className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
          {materials.map((material) => (
            <li key={material.id}>
              <Card className='h-full'>
                <CardHeader>
                  <CardTitle className='truncate' title={material.title}>
                    {material.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                    <FileText aria-hidden='true' className='size-4' />
                    {t('materials.attachmentCount', {
                      count: material.attachments.length,
                    })}
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => setDetail(material)}
                    >
                      {t('materials.viewAction')}
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => setEditTarget(material)}
                    >
                      {t('materials.editAction')}
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      aria-label={t('materials.deleteAction')}
                      onClick={() => setDeleteTarget(material)}
                    >
                      <Trash2 aria-hidden='true' />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      {createOpen ? (
        <MaterialFormDialog
          key='create'
          open
          onOpenChange={setCreateOpen}
          onSaved={(saved) => {
            upsert(saved);
            setCreateOpen(false);
          }}
        />
      ) : null}

      {detail ? (
        <MaterialDetailDialog
          material={detail}
          open
          onOpenChange={(open) => {
            if (!open) setDetail(undefined);
          }}
          onEdit={() => {
            setDetail(undefined);
            setEditTarget(detail);
          }}
        />
      ) : null}

      {editTarget ? (
        <MaterialFormDialog
          key={`edit-${editTarget.id}`}
          open
          material={editTarget}
          onOpenChange={(open) => {
            if (!open) setEditTarget(undefined);
          }}
          onSaved={(saved) => {
            upsert(saved);
            setEditTarget(undefined);
            setDetail(saved);
          }}
        />
      ) : null}

      <AlertDialog
        open={deleteTarget !== undefined}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('materials.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('materials.deleteDescription', {
                title: deleteTarget?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? t('materials.deleting') : t('materials.deleteAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
