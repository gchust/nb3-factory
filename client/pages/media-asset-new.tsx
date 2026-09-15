import {
  apiClientToken,
  ApiClientError,
  useService,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import { AssetTypeBadge } from '@/components/media/asset-badges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FileUploadField,
  clientFileRepositoryManagerToken,
  type FileRecord,
  type FileUploadStatus,
} from '@/extensions/nocobase-file-component-ui';
import {
  ACCEPTED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  createAsset,
  detectMediaType,
  mediaErrorKey,
} from '@/lib/media';

export default function MediaAssetNewPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(() => manager.repository('mediaFiles'), [manager]);
  const navigate = useNavigate();
  const [files, setFiles] = useState<readonly FileRecord[]>([]);
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<FileUploadStatus>('idle');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const selected = files[0];
  const detectedType = selected
    ? detectMediaType(selected.filename)
    : undefined;

  function reportUploadError(cause: Error): void {
    // The upload control rejects over-sized and disallowed files with its own English message;
    // replace those two with the application's translated wording. Server messages already arrive
    // in the request's language and pass through unchanged.
    if (/maximum size/i.test(cause.message)) {
      setError(
        t('media.error.tooLarge', {
          maxMb: Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024)),
        }),
      );
      return;
    }
    if (/not allowed/i.test(cause.message)) {
      setError(t('media.error.typeNotAllowed'));
      return;
    }
    setError(cause.message);
  }

  async function save(): Promise<void> {
    if (!selected) {
      setError(
        t('media.form.chooseFileFirst', {
          defaultValue: 'Choose a file to upload.',
        }),
      );
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const asset = await createAsset(api, {
        fileId: selected.id,
        name: name.trim() || selected.filename,
        tags: tags.trim() || undefined,
      });
      await navigate(`/media-assets/${asset.id}`);
    } catch (cause) {
      const code = cause instanceof ApiClientError ? cause.code : undefined;
      const key = mediaErrorKey(code);
      setError(
        cause instanceof ApiClientError
          ? key
            ? t(key, { defaultValue: cause.message })
            : cause.message
          : t('media.form.saveFailed', {
              defaultValue: 'Unable to save the media asset.',
            }),
      );
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || status === 'uploading';

  return (
    <section className='mx-auto max-w-3xl space-y-6 p-6'>
      <header className='space-y-2'>
        <Button
          variant='ghost'
          size='sm'
          render={<Link to='/media-assets' />}
          className='-ml-2'
        >
          <ArrowLeft aria-hidden='true' />
          {t('media.form.back')}
        </Button>
        <h1 className='font-heading text-2xl font-semibold'>
          {t('media.form.title')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('media.form.description')}
        </p>
      </header>

      <form
        className='space-y-5 rounded-xl border bg-card p-5'
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className='space-y-2'>
          <Label>{t('media.fields.file')}</Label>
          <FileUploadField
            repository={repository}
            value={files}
            onChange={setFiles}
            multiple={false}
            maxSize={MAX_UPLOAD_BYTES}
            onStatusChange={setStatus}
            onError={reportUploadError}
            labels={{
              choose: t('media.form.chooseFile'),
              remove: t('media.form.removeFile'),
              retry: t('media.form.retryFile'),
            }}
          />
          <p className='text-xs text-muted-foreground'>
            {t('media.form.allowedHint', {
              extensions: ACCEPTED_EXTENSIONS.join(', '),
              maxMb: Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024)),
            })}
          </p>
        </div>

        {selected ? (
          <p className='flex items-center gap-2 text-sm text-muted-foreground'>
            {detectedType ? (
              <>
                {t('media.form.detectedType')}
                <AssetTypeBadge type={detectedType} />
              </>
            ) : (
              t('media.form.unknownType', {
                defaultValue: 'This file type is not supported.',
              })
            )}
          </p>
        ) : null}

        <div className='space-y-2'>
          <Label htmlFor='media-name'>{t('media.fields.name')}</Label>
          <Input
            id='media-name'
            value={name}
            required
            placeholder={t('media.form.namePlaceholder', {
              defaultValue: 'Display name',
            })}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className='space-y-2'>
          <Label htmlFor='media-tags'>{t('media.fields.tags')}</Label>
          <Input
            id='media-tags'
            value={tags}
            placeholder={t('media.form.tagsPlaceholder', {
              defaultValue: 'marketing, launch',
            })}
            onChange={(event) => setTags(event.target.value)}
          />
          <p className='text-xs text-muted-foreground'>
            {t('media.form.tagsHint')}
          </p>
        </div>

        {error ? (
          <p
            role='alert'
            data-testid='media-form-error'
            className='rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'
          >
            {error}
          </p>
        ) : null}

        <div className='flex justify-end gap-2'>
          <Button
            type='button'
            variant='outline'
            render={<Link to='/media-assets' />}
          >
            {t('actions.cancel')}
          </Button>
          <Button type='submit' disabled={busy || !selected}>
            {busy ? (
              <Loader2 className='animate-spin' aria-hidden='true' />
            ) : null}
            {saving ? t('media.form.saving') : t('media.form.save')}
          </Button>
        </div>
      </form>
    </section>
  );
}
