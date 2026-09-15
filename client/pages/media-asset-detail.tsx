import {
  apiClientToken,
  ApiClientError,
  useService,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, Download, Loader2, Pencil } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import {
  AssetStatusBadge,
  AssetTypeBadge,
} from '@/components/media/asset-badges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FilePreviewField,
  type FileRecord,
} from '@/extensions/nocobase-file-component-ui';
import {
  fetchAccess,
  fetchAsset,
  formatDate,
  formatSize,
  mediaErrorKey,
  tagsToInput,
  toFileRecord,
  updateAsset,
  type AssetStatus,
  type MediaAccess,
  type MediaAsset,
} from '@/lib/media';

export default function MediaAssetDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const params = useParams();
  const id = params.id ?? '';
  const [asset, setAsset] = useState<MediaAsset>();
  const [access, setAccess] = useState<MediaAccess>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([fetchAccess(api), fetchAsset(api, id)])
      .then(([resolved, value]) => {
        if (!active) return;
        setAccess(resolved);
        setAsset(value);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        const code = cause instanceof ApiClientError ? cause.code : undefined;
        const key = mediaErrorKey(code);
        setError(
          cause instanceof ApiClientError
            ? key
              ? t(key, { defaultValue: cause.message })
              : cause.message
            : t('media.detail.loadFailed', {
                defaultValue: 'Unable to load the media asset.',
              }),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, id, t]);

  if (loading) {
    return (
      <section className='flex items-center gap-2 p-6 text-sm text-muted-foreground'>
        <Loader2 className='animate-spin' aria-hidden='true' />
        {t('media.detail.loading')}
      </section>
    );
  }

  if (error || !asset) {
    return (
      <section className='space-y-4 p-6'>
        <p
          role='alert'
          className='rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'
        >
          {error ?? t('media.error.notFound')}
        </p>
        <Button variant='outline' render={<Link to='/media-assets' />}>
          <ArrowLeft aria-hidden='true' />
          {t('media.detail.back')}
        </Button>
      </section>
    );
  }

  const record: FileRecord = toFileRecord(asset);
  const canDownload = Boolean(access?.canDownload && asset.contentUrl);

  return (
    <section className='mx-auto max-w-4xl space-y-6 p-6'>
      <header className='space-y-3'>
        <Button
          variant='ghost'
          size='sm'
          render={<Link to='/media-assets' />}
          className='-ml-2'
        >
          <ArrowLeft aria-hidden='true' />
          {t('media.detail.back')}
        </Button>
        <div className='flex flex-wrap items-center gap-3'>
          <h1 className='font-heading text-2xl font-semibold'>{asset.name}</h1>
          <AssetTypeBadge type={asset.type} />
          <AssetStatusBadge status={asset.status} />
          {access?.canManage ? (
            <Button
              variant='outline'
              size='sm'
              onClick={() => setEditing((current) => !current)}
              data-testid='media-detail-edit'
            >
              <Pencil aria-hidden='true' />
              {t('media.detail.edit')}
            </Button>
          ) : null}
        </div>
      </header>

      <div className='grid gap-6 lg:grid-cols-[2fr_1fr]'>
        <section className='space-y-3 rounded-xl border bg-card p-5'>
          <h2 className='font-heading text-base font-medium'>
            {t('media.detail.preview')}
          </h2>
          <FilePreviewField
            files={[record]}
            showFilenames
            emptyState={
              <span className='text-sm text-muted-foreground'>
                {t('media.detail.noPreview')}
              </span>
            }
            labels={{
              preview: t('media.detail.openPreview'),
              download: t('media.detail.download'),
            }}
          />
          <p className='text-xs text-muted-foreground'>
            {t('media.detail.previewHint')}
          </p>
        </section>

        <section className='space-y-4'>
          <div className='space-y-3 rounded-xl border bg-card p-5 text-sm'>
            <h2 className='font-heading text-base font-medium'>
              {t('media.detail.information')}
            </h2>
            <MetaRow
              label={t('media.fields.filename')}
              value={asset.filename}
            />
            <MetaRow
              label={t('media.fields.mimeType')}
              value={asset.mimeType}
            />
            <MetaRow
              label={t('media.fields.size')}
              value={formatSize(asset.size)}
            />
            <MetaRow
              label={t('media.fields.tags')}
              value={
                asset.tags.length
                  ? asset.tags.join(', ')
                  : t('media.detail.noTags')
              }
            />
            <MetaRow
              label={t('media.fields.uploader')}
              value={asset.uploaderName ?? t('media.detail.unknownUploader')}
            />
            <MetaRow
              label={t('media.fields.uploadedAt')}
              value={formatDate(asset.createdAt)}
            />
            {asset.status === 'disabled' ? (
              <p className='text-xs text-muted-foreground'>
                {t('media.detail.disabledHint')}
              </p>
            ) : null}
          </div>

          {canDownload ? (
            <Button
              className='w-full'
              onClick={() => downloadAsset(asset)}
              data-testid='media-detail-download'
            >
              <Download aria-hidden='true' />
              {t('media.detail.download')}
            </Button>
          ) : null}
        </section>
      </div>

      {editing && access?.canManage ? (
        <EditForm
          asset={asset}
          onSaved={(updated) => {
            setAsset(updated);
            setEditing(false);
          }}
        />
      ) : null}
    </section>
  );
}

function EditForm({
  asset,
  onSaved,
}: {
  readonly asset: MediaAsset;
  readonly onSaved: (asset: MediaAsset) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const [name, setName] = useState(asset.name);
  const [tags, setTags] = useState(() => tagsToInput(asset.tags));
  const [status, setStatus] = useState<AssetStatus>(asset.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(): Promise<void> {
    setSaving(true);
    setError(undefined);
    try {
      const updated = await updateAsset(api, asset.id, { name, tags, status });
      onSaved(updated);
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

  return (
    <form
      className='space-y-5 rounded-xl border bg-card p-5'
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h2 className='font-heading text-base font-medium'>
        {t('media.detail.editTitle')}
      </h2>
      <div className='space-y-2'>
        <Label htmlFor='media-edit-name'>{t('media.fields.name')}</Label>
        <Input
          id='media-edit-name'
          value={name}
          required
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='media-edit-tags'>{t('media.fields.tags')}</Label>
        <Input
          id='media-edit-tags'
          value={tags}
          onChange={(event) => setTags(event.target.value)}
        />
        <p className='text-xs text-muted-foreground'>
          {t('media.form.tagsHint')}
        </p>
      </div>
      <div className='space-y-2'>
        <Label htmlFor='media-edit-status'>{t('media.fields.status')}</Label>
        <Select
          value={status}
          onValueChange={(value: string | null) => {
            if (value === 'available' || value === 'disabled') setStatus(value);
          }}
        >
          <SelectTrigger id='media-edit-status' className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='available'>
              {t('media.status.available')}
            </SelectItem>
            <SelectItem value='disabled'>
              {t('media.status.disabled')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {error ? (
        <p
          role='alert'
          className='rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'
        >
          {error}
        </p>
      ) : null}
      <div className='flex justify-end'>
        <Button type='submit' disabled={saving} data-testid='media-detail-save'>
          {saving ? (
            <Loader2 className='animate-spin' aria-hidden='true' />
          ) : null}
          {saving ? t('media.form.saving') : t('actions.save')}
        </Button>
      </div>
    </form>
  );
}

function MetaRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='flex items-start justify-between gap-3'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='text-right break-all'>{value}</span>
    </div>
  );
}

function downloadAsset(asset: MediaAsset): void {
  if (!asset.contentUrl) return;
  const link = document.createElement('a');
  link.href = asset.contentUrl;
  link.download = asset.filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
}
