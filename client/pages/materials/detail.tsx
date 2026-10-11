import { useApiClient, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';

import { BackButton } from '@/components/back-button';
import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FileList,
  FileUploadField,
  clientFileRepositoryManagerToken,
  type FileRecord,
  type FileUploadStatus,
} from '@/extensions/nocobase-file-component-ui';

import {
  MATERIAL_FILE_ACCEPT,
  asFileRecord,
  deleteMaterial,
  getMaterial,
  updateMaterial,
} from './types.js';

/**
 * A material's detail: its title, the attachments already saved to it, and an upload for new ones. Saved attachments
 * can be previewed, downloaded and removed here; removing one only takes effect when the change is saved.
 */
export default function MaterialDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const params = useParams();
  const id = Number(params.materialId);
  const repository = useService(clientFileRepositoryManagerToken).repository(
    'materialFiles',
  );
  const [title, setTitle] = useState<string>();
  const [files, setFiles] = useState<readonly FileRecord[]>([]);
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [status, setStatus] = useState<FileUploadStatus>('idle');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const invalidId = !Number.isInteger(id) || id <= 0;

  useEffect(() => {
    if (invalidId) return;
    const controller = new AbortController();
    void getMaterial(api, id, controller.signal)
      .then((material) => {
        if (controller.signal.aborted) return;
        setError(undefined);
        setTitle(material.title);
        setFiles(material.files.map(asFileRecord));
        setSavedIds(new Set(material.files.map((file) => file.id)));
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'materials.notFound');
      });
    return () => controller.abort();
  }, [api, id, invalidId]);

  const savedFiles = files.filter((file) => savedIds.has(file.id));
  const newFiles = files.filter((file) => !savedIds.has(file.id));

  const submit = async (): Promise<void> => {
    setError(undefined);
    setNotice(undefined);
    if (!title || !title.trim()) {
      setError('materials.titleRequired');
      return;
    }
    setSubmitting(true);
    try {
      const saved = await updateMaterial(api, id, {
        title: title.trim(),
        fileIds: files.map((file) => file.id),
      });
      setTitle(saved.title);
      setFiles(saved.files.map(asFileRecord));
      setSavedIds(new Set(saved.files.map((file) => file.id)));
      setNotice('materials.saved');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'materials.saveFailed');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (): Promise<void> => {
    setError(undefined);
    setNotice(undefined);
    setDeleting(true);
    try {
      await deleteMaterial(api, id);
      void navigate('..', { replace: true });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'materials.deleteFailed',
      );
      setDeleting(false);
    }
  };

  if (invalidId || (error && title === undefined)) {
    return (
      <RouteChildPage>
        <PageContainer className='mx-auto max-w-3xl'>
          <BackButton />
          <PageHeader title={t('materials.detailTitle')} />
          <p
            className='rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive'
            role='alert'
          >
            {t(invalidId ? 'materials.notFound' : (error ?? ''), {
              defaultValue: error,
            })}
          </p>
        </PageContainer>
      </RouteChildPage>
    );
  }

  return (
    <RouteChildPage>
      <PageContainer className='mx-auto max-w-3xl'>
        <BackButton />
        <PageHeader
          description={t('materials.detailDescription')}
          title={t('materials.detailTitle')}
        />

        {title === undefined ? (
          <Loading />
        ) : (
          <>
            <div className='space-y-2'>
              <Label htmlFor='material-title'>
                {t('materials.titleLabel')}
              </Label>
              <Input
                id='material-title'
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('materials.titlePlaceholder')}
                value={title}
              />
            </div>

            <div className='space-y-2'>
              <p className='text-sm font-medium'>{t('materials.savedFiles')}</p>
              <FileList
                emptyState={t('materials.noFiles')}
                files={savedFiles}
                onError={(cause) => setError(cause.message)}
                onRemove={(file) =>
                  setFiles((current) =>
                    current.filter((candidate) => candidate.id !== file.id),
                  )
                }
              />
            </div>

            <div className='space-y-2'>
              <p className='text-sm font-medium'>{t('materials.addFiles')}</p>
              <p className='text-sm text-muted-foreground'>
                {t('materials.accept')}
              </p>
              <FileUploadField
                accept={MATERIAL_FILE_ACCEPT}
                multiple
                onChange={(next) =>
                  setFiles((current) => [
                    ...current.filter((file) => savedIds.has(file.id)),
                    ...next,
                  ])
                }
                onError={(cause) => setError(cause.message)}
                onStatusChange={setStatus}
                repository={repository}
                value={newFiles}
              />
              {status === 'uploading' ? (
                <p className='text-sm text-muted-foreground' role='status'>
                  {t('materials.uploading')}
                </p>
              ) : null}
            </div>

            {error ? (
              <p
                className='rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive'
                role='alert'
              >
                {t(error, { defaultValue: error })}
              </p>
            ) : null}
            {notice ? (
              <p className='text-sm text-muted-foreground' role='status'>
                {t(notice)}
              </p>
            ) : null}

            <div className='flex flex-wrap items-center gap-2'>
              <Button
                disabled={submitting || status === 'uploading'}
                onClick={() => void submit()}
              >
                {submitting ? t('materials.saving') : t('materials.save')}
              </Button>
              {confirmingDelete ? (
                <>
                  <span className='text-sm text-muted-foreground'>
                    {t('materials.confirmDelete')}
                  </span>
                  <Button
                    disabled={deleting}
                    onClick={() => void remove()}
                    variant='destructive'
                  >
                    {deleting ? t('materials.deleting') : t('materials.delete')}
                  </Button>
                  <Button
                    disabled={deleting}
                    onClick={() => setConfirmingDelete(false)}
                    variant='outline'
                  >
                    {t('materials.cancel')}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => setConfirmingDelete(true)}
                  variant='outline'
                >
                  {t('materials.delete')}
                </Button>
              )}
            </div>
          </>
        )}
      </PageContainer>
    </RouteChildPage>
  );
}
