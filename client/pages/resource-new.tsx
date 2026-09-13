import { useService, apiClientToken } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import {
  FileUploadField,
  type FileUploadStatus,
  type UploadedFile,
} from '@/components/file-upload-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  uploadResourceFile,
  type FileRecordView,
} from '@/lib/resource-files-api';
import {
  createResource,
  errorCode,
  type CreateResourceInput,
} from '@/lib/resource-center-api';

const COVER_ACCEPT = ['image/*'];
const DOCUMENT_ACCEPT = ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf'];

export default function ResourceNewPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [cover, setCover] = useState<UploadedFile | null>(null);
  const [document, setDocument] = useState<UploadedFile | null>(null);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Two fields upload independently; saving waits until both are settled. */
  const handleUploadStatus = (status: FileUploadStatus): void => {
    setPendingUploads((count) =>
      status === 'uploading' ? count + 1 : Math.max(0, count - 1),
    );
  };

  const uploading = pendingUploads > 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (saving || uploading) return;
    setError(null);
    setSaving(true);

    const input: CreateResourceInput = {
      title: title.trim(),
      category: category.trim(),
      coverFileId: cover?.id ?? null,
      documentFileId: document?.id ?? null,
    };

    void createResource(api, input)
      .then((resource) => {
        void navigate(`/resources/${resource.id}`);
      })
      .catch((cause: unknown) => {
        setError(messageForCode(errorCode(cause), t));
        setSaving(false);
      });
  };

  const upload = (file: File): Promise<FileRecordView> =>
    uploadResourceFile(api, file);

  return (
    <section className='mx-auto w-full max-w-2xl space-y-6 px-6 py-8'>
      <header className='space-y-1'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('resources.createTitle')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('resources.createDescription')}
        </p>
      </header>

      <form className='space-y-6' onSubmit={handleSubmit}>
        <div className='space-y-2'>
          <Label htmlFor='resource-title'>{t('resources.fields.title')}</Label>
          <Input
            id='resource-title'
            value={title}
            maxLength={200}
            required
            autoFocus
            placeholder={t('resources.placeholders.title')}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className='space-y-2'>
          <Label htmlFor='resource-category'>
            {t('resources.fields.category')}
          </Label>
          <Input
            id='resource-category'
            value={category}
            maxLength={100}
            required
            placeholder={t('resources.placeholders.category')}
            onChange={(event) => setCategory(event.target.value)}
          />
        </div>

        <div className='space-y-2'>
          <Label>{t('resources.fields.cover')}</Label>
          <FileUploadField
            value={cover}
            onChange={setCover}
            upload={upload}
            accept={COVER_ACCEPT}
            labels={{
              choose: t('resources.upload.chooseCover'),
              uploading: t('resources.upload.uploading'),
              remove: t('resources.upload.remove'),
              failed: t('resources.upload.failed'),
            }}
            onStatusChange={handleUploadStatus}
          />
          <p className='text-xs text-muted-foreground'>
            {t('resources.fields.coverHint')}
          </p>
        </div>

        <div className='space-y-2'>
          <Label>{t('resources.fields.document')}</Label>
          <FileUploadField
            value={document}
            onChange={setDocument}
            upload={upload}
            accept={DOCUMENT_ACCEPT}
            labels={{
              choose: t('resources.upload.chooseDocument'),
              uploading: t('resources.upload.uploading'),
              remove: t('resources.upload.remove'),
              failed: t('resources.upload.failed'),
            }}
            onStatusChange={handleUploadStatus}
          />
          <p className='text-xs text-muted-foreground'>
            {t('resources.fields.documentHint')}
          </p>
        </div>

        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        ) : null}

        <div className='flex items-center gap-3'>
          <Button type='submit' disabled={saving || uploading}>
            {saving ? t('resources.saving') : t('resources.save')}
          </Button>
          <Button
            type='button'
            variant='outline'
            disabled={saving}
            onClick={() => {
              void navigate('/resources');
            }}
          >
            {t('resources.cancel')}
          </Button>
          <Link
            to='/resources'
            className='ml-auto text-sm text-muted-foreground underline-offset-4 hover:underline'
          >
            {t('resources.backToList')}
          </Link>
        </div>
      </form>
    </section>
  );
}

function messageForCode(
  code: string | undefined,
  t: (key: string) => string,
): string {
  switch (code) {
    case 'INVALID_TITLE':
      return t('resources.errors.title');
    case 'INVALID_CATEGORY':
      return t('resources.errors.category');
    case 'INVALID_FILE_ID':
    case 'FILE_NOT_FOUND':
      return t('resources.errors.file');
    default:
      return t('resources.errors.save');
  }
}
