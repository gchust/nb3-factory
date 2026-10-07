import { useApiClient, useService, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { BackButton } from '@/components/back-button';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  FileUploadField,
  clientFileRepositoryManagerToken,
  type FileRecord,
} from '@/extensions/nocobase-file-component-ui';
import { createMaterial } from './api.js';
import { materialDetailPath, materialListBase } from './paths.js';

const ACCEPTED_FILES = ['image/*', '.png', '.jpg', '.jpeg', '.docx'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function NewProjectMaterialPage(): ReactElement {
  const api = useApiClient();
  const files = useService(clientFileRepositoryManagerToken);
  const toaster = useToaster();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const base = materialListBase(location.pathname);
  const repository = files.repository('projectMaterialFiles');

  const [title, setTitle] = useState('');
  const [uploads, setUploads] = useState<readonly FileRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    // The title is checked here rather than only on the server so a save that has nothing to save
    // is answered in place — and the attachments already uploaded stay uploaded, so typing the
    // title and saving again does not upload anything a second time.
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    setSaving(true);
    try {
      const material = await createMaterial(api, {
        title: title.trim(),
        fileIds: uploads.map((file) => file.id),
      });
      toaster.show({ type: 'success', title: t('projectMaterials.saved') });
      await navigate(materialDetailPath(location.pathname, material.id), {
        replace: true,
      });
    } catch {
      toaster.show({ type: 'error', title: t('projectMaterials.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <BackButton to={base} />
      <PageHeader title={t('projectMaterials.new')} />
      <form
        className='max-w-2xl space-y-6'
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className='space-y-2'>
          <Label htmlFor='project-material-title'>
            {t('projectMaterials.formTitle')}
          </Label>
          <Input
            id='project-material-title'
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
          <FileUploadField
            repository={repository}
            value={uploads}
            onChange={setUploads}
            onStatusChange={(status) => setUploading(status === 'uploading')}
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
          {saving ? t('projectMaterials.saving') : t('projectMaterials.save')}
        </Button>
      </form>
    </PageContainer>
  );
}
