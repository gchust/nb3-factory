import { useApiClient, ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';

import { BackButton } from '@/components/back-button';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';

import { MaterialBadges } from './badges.js';
import { MaterialFormDialog } from './material-form-dialog.js';
import { deleteMaterial, fetchMaterial } from './materials-api.js';
import { SharePanel } from './share-panel.js';
import type { MaterialDetail } from './types.js';

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** Reads the id from the route and rebuilds the record view when the id changes. */
export default function MaterialDetailPage(): ReactElement {
  const { materialId } = useParams<{ materialId: string }>();
  if (!materialId) return <Unavailable />;
  return <MaterialDetailView key={materialId} materialId={materialId} />;
}

function Unavailable(): ReactElement {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <BackButton to='/materials'>{t('materials.back')}</BackButton>
      <div className='space-y-2 rounded-lg border border-dashed border-border p-8 text-center'>
        <p className='font-medium'>{t('materials.unavailable.title')}</p>
        <p className='text-sm text-muted-foreground'>
          {t('materials.unavailable.description')}
        </p>
      </div>
    </PageContainer>
  );
}

function MaterialDetailView({
  materialId,
}: {
  readonly materialId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = reloadCount;
  const [result, setResult] = useState<{
    readonly key: number;
    readonly material?: MaterialDetail;
    readonly error?: unknown;
  }>();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchMaterial(api, materialId, controller.signal).then(
      (material) => {
        if (!controller.signal.aborted) {
          setResult({ key: reloadCount, material });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, error });
      },
    );
    return () => controller.abort();
  }, [api, materialId, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  // A confidential document, an unshared draft and a revoked share all answer 404,
  // so they read the same to a viewer who may not see them.
  const notFound = error instanceof ApiClientError && error.status === 404;
  const material = result?.material;

  function reload(): void {
    setReloadCount((count) => count + 1);
  }

  async function handleDelete(): Promise<void> {
    setDeleting(true);
    try {
      await deleteMaterial(api, materialId);
      void navigate('/materials');
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  if (notFound) return <Unavailable />;

  return (
    <PageContainer>
      <BackButton to='/materials'>{t('materials.back')}</BackButton>

      {loading ? (
        <div className='flex items-center gap-2 text-muted-foreground'>
          <Spinner />
          {t('status.loading')}
        </div>
      ) : null}

      {!loading && error && !notFound ? (
        <div className='space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4'>
          <div>
            <p className='font-medium'>{t('materials.error.title')}</p>
            <p className='text-sm text-muted-foreground'>
              {t('materials.error.description')}
            </p>
          </div>
          <Button type='button' variant='outline' onClick={reload}>
            {t('status.retry')}
          </Button>
        </div>
      ) : null}

      {material ? (
        <>
          <PageHeader
            title={material.title}
            description={
              <span className='space-y-2'>
                <MaterialBadges material={material} />
                <span className='block'>
                  {t('materials.owner', { name: material.ownerName })}
                </span>
              </span>
            }
            actions={
              material.canEdit ? (
                <>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => setEditing(true)}
                  >
                    <Pencil aria-hidden='true' />
                    {t('materials.edit')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Trash2 aria-hidden='true' />
                    {t('materials.delete')}
                  </Button>
                </>
              ) : null
            }
          />

          <article className='rounded-lg border border-border p-4'>
            <h2 className='mb-3 font-heading text-lg font-medium'>
              {t('materials.field.content')}
            </h2>
            <div className='text-sm leading-6 whitespace-pre-wrap'>
              {material.content || (
                <span className='text-muted-foreground'>
                  {t('materials.noContent')}
                </span>
              )}
            </div>
          </article>

          <p className='text-xs text-muted-foreground'>
            {t('materials.updatedAt', {
              date: formatDate(material.updatedAt),
            })}
          </p>

          {material.canShare ? (
            <SharePanel material={material} onChanged={reload} />
          ) : null}
        </>
      ) : null}

      {editing && material ? (
        <MaterialFormDialog
          material={material}
          onOpenChange={setEditing}
          onSaved={() => reload()}
        />
      ) : null}

      {confirmingDelete ? (
        <Dialog open onOpenChange={setConfirmingDelete}>
          <DialogContent className='sm:max-w-md' showCloseButton>
            <DialogHeader>
              <DialogTitle>{t('materials.deleteTitle')}</DialogTitle>
              <DialogDescription>
                {t('materials.deleteConfirm', { title: material?.title ?? '' })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setConfirmingDelete(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button
                type='button'
                variant='destructive'
                disabled={deleting}
                onClick={() => void handleDelete()}
              >
                {deleting ? <Spinner /> : null}
                {deleting ? t('materials.deleting') : t('materials.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </PageContainer>
  );
}
