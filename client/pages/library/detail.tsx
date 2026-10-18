import { useTranslation } from '@nocobase/i18n/client';
import { PencilIcon, Share2Icon, Trash2Icon } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useParams, useNavigate } from 'react-router';

import { BackButton } from '#components/back-button';
import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Button } from '#components/ui/button';

import { errorMessage, isNotFound, type LibraryMaterial } from './api.js';
import {
  MaterialBadges,
  MaterialFormDialog,
  ShareDialog,
} from './components.js';
import { useLibraryClient, useSessionExpiredRedirect } from './use-library.js';

export default function MaterialDetailPage(): ReactElement {
  const { t } = useTranslation();
  const client = useLibraryClient();
  const { materialId = '' } = useParams<{ materialId: string }>();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<{
    readonly id: string;
    readonly material: LibraryMaterial;
  } | null>(null);
  const [failure, setFailure] = useState<{
    readonly id: string;
    readonly cause: unknown;
  } | null>(null);
  const [version, setVersion] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client
      .material(materialId)
      .then((next) => {
        if (cancelled) return;
        setLoaded({ id: materialId, material: next });
        setFailure(null);
      })
      .catch((cause) => {
        if (!cancelled) setFailure({ id: materialId, cause });
      });
    return () => {
      cancelled = true;
    };
  }, [client, materialId, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  const remove = async (): Promise<void> => {
    setDeleteOpen(false);
    try {
      await client.deleteMaterial(materialId);
      await navigate('/materials', { replace: true });
    } catch (cause) {
      setFailure({ id: materialId, cause });
    }
  };

  // A different id must never show the previous material or its error, so both are keyed by the id they belong to.
  const material = loaded?.id === materialId ? loaded.material : null;
  const error = failure?.id === materialId ? failure.cause : null;

  useSessionExpiredRedirect(error);

  if (material === null && error === null) {
    return (
      <PageContainer>
        <BackButton to='/materials'>{t('library.detail.back')}</BackButton>
        <Loading />
      </PageContainer>
    );
  }

  if (material === null) {
    // A material that is not visible is answered exactly like one that does not exist, so nothing is leaked here.
    return (
      <PageContainer>
        <BackButton to='/materials'>{t('library.detail.back')}</BackButton>
        {isNotFound(error) ? (
          <Alert>
            <AlertTitle>{t('library.detail.notFoundTitle')}</AlertTitle>
            <AlertDescription>
              {t('library.detail.notFoundDescription')}
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant='destructive'>
            <AlertTitle>{t('library.error.title')}</AlertTitle>
            <AlertDescription>{errorMessage(error)}</AlertDescription>
          </Alert>
        )}
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <BackButton to='/materials'>{t('library.detail.back')}</BackButton>
      <PageHeader
        title={material.title}
        description={`${t('library.owner')}: ${material.ownerName || material.ownerId}`}
        actions={
          <>
            {material.writable ? (
              <Button
                type='button'
                variant='outline'
                onClick={() => setEditOpen(true)}
              >
                <PencilIcon data-icon='inline-start' />
                {t('library.actions.edit')}
              </Button>
            ) : null}
            {material.canShare ? (
              <Button
                type='button'
                variant='outline'
                onClick={() => setShareOpen(true)}
              >
                <Share2Icon data-icon='inline-start' />
                {t('library.actions.share')}
              </Button>
            ) : null}
            {material.writable ? (
              <Button
                type='button'
                variant='destructive'
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2Icon data-icon='inline-start' />
                {t('library.actions.delete')}
              </Button>
            ) : null}
          </>
        }
      />
      <MaterialBadges material={material} />
      <div className='rounded-xl bg-card p-6 text-sm leading-7 text-card-foreground ring-1 ring-foreground/10'>
        {material.body ? (
          <p className='whitespace-pre-wrap'>{material.body}</p>
        ) : (
          <p className='text-muted-foreground'>
            {t('library.detail.bodyEmpty')}
          </p>
        )}
      </div>

      {editOpen ? (
        <MaterialFormDialog
          material={material}
          onOpenChange={(open) => {
            if (!open) setEditOpen(false);
          }}
          onSaved={reload}
        />
      ) : null}
      {shareOpen ? (
        <ShareDialog
          open
          material={material}
          onOpenChange={(open) => {
            if (!open) setShareOpen(false);
          }}
          onChanged={reload}
        />
      ) : null}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('library.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('library.delete.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('library.delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>
              {t('library.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
