import { useApiClient, useService, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import { useLocation, useParams } from 'react-router';

import { BackButton } from '@/components/back-button';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  FileList,
  FileUploadField,
  clientFileRepositoryManagerToken,
  type FileRecord,
} from '@/extensions/nocobase-file-component-ui';
import { findMaterial, updateMaterial } from './api.js';
import { materialListBase } from './paths.js';
import type { ProjectMaterial } from './types.js';

const ACCEPTED_FILES = ['image/*', '.png', '.jpg', '.jpeg', '.docx'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * A stable empty value for the upload field. The field appends each completed upload to the value
 * it is given, so the saved set stays the single source of truth in `attachments`: a finished
 * upload moves out of the drop zone and into the list below, where it can be previewed and removed.
 */
const NO_UPLOADS: readonly FileRecord[] = [];

export default function ProjectMaterialDetailPage(): ReactElement {
  const api = useApiClient();
  const files = useService(clientFileRepositoryManagerToken);
  const toaster = useToaster();
  const { t } = useTranslation();
  const location = useLocation();
  const params = useParams();
  const id = Number(params.id);
  // A malformed id cannot be a record, so it is answered in place rather than by requesting it.
  const invalidId = !Number.isInteger(id) || id <= 0;
  const base = materialListBase(location.pathname);
  const repository = files.repository('projectMaterialFiles');

  const [material, setMaterial] = useState<ProjectMaterial>();
  const [missing, setMissing] = useState(false);
  const isMissing = invalidId || missing;
  const [failed, setFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [title, setTitle] = useState('');
  const [attachments, setAttachments] = useState<readonly FileRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (invalidId) return undefined;
    let active = true;
    findMaterial(api, id)
      .then((data) => {
        if (!active) return;
        if (!data) {
          setMissing(true);
          return;
        }
        setMaterial(data);
        setTitle(data.title);
        setAttachments([...data.files]);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [api, id, invalidId, reloadToken]);

  const reload = (): void => {
    setFailed(false);
    setReloadToken((value) => value + 1);
  };

  const save = async (): Promise<void> => {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateMaterial(api, id, {
        title: title.trim(),
        fileIds: attachments.map((file) => file.id),
      });
      setMaterial(updated);
      setTitle(updated.title);
      setAttachments([...updated.files]);
      toaster.show({ type: 'success', title: t('projectMaterials.saved') });
    } catch {
      toaster.show({ type: 'error', title: t('projectMaterials.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton to={base} />
        {isMissing ? (
          <>
            <PageHeader title={t('projectMaterials.notFound')} />
            <p className='text-muted-foreground'>
              {t('projectMaterials.notFoundDescription')}
            </p>
          </>
        ) : failed && material === undefined ? (
          <div role='alert' className='space-y-3 rounded-md border p-4'>
            <p>{t('projectMaterials.loadFailed')}</p>
            <Button type='button' variant='outline' onClick={reload}>
              {t('projectMaterials.retry')}
            </Button>
          </div>
        ) : material === undefined ? (
          <div
            role='status'
            className='flex items-center gap-2 text-muted-foreground'
          >
            <Spinner />
            {t('status.loading')}
          </div>
        ) : (
          <>
            <PageHeader title={material.title} />
            <form
              className='max-w-2xl space-y-6'
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className='space-y-2'>
                <Label htmlFor='project-material-detail-title'>
                  {t('projectMaterials.formTitle')}
                </Label>
                <Input
                  id='project-material-detail-title'
                  value={title}
                  aria-invalid={titleError}
                  placeholder={t('projectMaterials.formTitlePlaceholder')}
                  onChange={(event) => {
                    setTitle(event.currentTarget.value);
                    if (event.currentTarget.value.trim()) setTitleError(false);
                  }}
                />
                {titleError ? (
                  <p role='alert' className='text-sm text-destructive'>
                    {t('projectMaterials.titleRequired')}
                  </p>
                ) : null}
              </div>
              <div className='space-y-2'>
                <div className='text-sm font-medium'>
                  {t('projectMaterials.attachments')}
                </div>
                <p className='text-sm text-muted-foreground'>
                  {t('projectMaterials.attachmentsHint')}
                </p>
                <FileList
                  files={attachments}
                  emptyState={t('projectMaterials.noAttachments')}
                  onRemove={(file) =>
                    setAttachments((current) =>
                      current.filter((candidate) => candidate.id !== file.id),
                    )
                  }
                  onError={() =>
                    toaster.show({
                      type: 'error',
                      title: t('projectMaterials.previewFailed'),
                    })
                  }
                />
                <FileUploadField
                  repository={repository}
                  value={NO_UPLOADS}
                  onChange={(records) =>
                    setAttachments((current) => [...current, ...records])
                  }
                  onStatusChange={(status) =>
                    setUploading(status === 'uploading')
                  }
                  onError={() =>
                    toaster.show({
                      type: 'error',
                      title: t('projectMaterials.uploadFailed'),
                    })
                  }
                  multiple
                  accept={ACCEPTED_FILES}
                  maxSize={MAX_FILE_SIZE}
                />
              </div>
              <Button type='submit' disabled={saving || uploading}>
                {saving ? <Spinner aria-hidden='true' /> : null}
                {saving
                  ? t('projectMaterials.saving')
                  : t('projectMaterials.save')}
              </Button>
            </form>
          </>
        )}
      </PageContainer>
    </RouteChildPage>
  );
}
