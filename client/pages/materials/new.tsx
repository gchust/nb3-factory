import { useApiClient, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { BackButton } from '@/components/back-button';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FileUploadField,
  clientFileRepositoryManagerToken,
  type FileRecord,
  type FileUploadStatus,
} from '@/extensions/nocobase-file-component-ui';

import { MATERIAL_FILE_ACCEPT, createMaterial } from './types.js';

/**
 * Creates a material. Files upload as they are chosen, before the form is saved, so a rejected save keeps them and the
 * user adds a title instead of uploading again.
 */
export default function NewMaterialPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const repository = useService(clientFileRepositoryManagerToken).repository(
    'materialFiles',
  );
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<readonly FileRecord[]>([]);
  const [status, setStatus] = useState<FileUploadStatus>('idle');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (): Promise<void> => {
    setError(undefined);
    if (!title.trim()) {
      setError('materials.titleRequired');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createMaterial(api, {
        title: title.trim(),
        fileIds: files.map((file) => file.id),
      });
      void navigate(`../${created.id}`, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'materials.saveFailed');
      setSubmitting(false);
    }
  };

  return (
    <RouteChildPage>
      <PageContainer className='mx-auto max-w-3xl'>
        <BackButton />
        <PageHeader
          description={t('materials.formDescription')}
          title={t('materials.new')}
        />

        <div className='space-y-2'>
          <Label htmlFor='material-title'>{t('materials.titleLabel')}</Label>
          <Input
            id='material-title'
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('materials.titlePlaceholder')}
            value={title}
          />
        </div>

        <div className='space-y-2'>
          <p className='text-sm font-medium'>{t('materials.filesLabel')}</p>
          <p className='text-sm text-muted-foreground'>
            {t('materials.accept')}
          </p>
          <FileUploadField
            accept={MATERIAL_FILE_ACCEPT}
            multiple
            onChange={(next) => setFiles(next)}
            onError={(cause) => setError(cause.message)}
            onStatusChange={setStatus}
            repository={repository}
            value={files}
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

        <div className='flex items-center gap-2'>
          <Button
            disabled={submitting || status === 'uploading'}
            onClick={() => void submit()}
          >
            {submitting ? t('materials.saving') : t('materials.save')}
          </Button>
        </div>
      </PageContainer>
    </RouteChildPage>
  );
}
