import {
  apiClientToken,
  ApiClientError,
  useService,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Loader2, Plus, Search } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

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
import { FileThumbnail } from '@/extensions/nocobase-file-component-ui';
import {
  MEDIA_TYPES,
  fetchAccess,
  fetchAssets,
  formatDate,
  formatSize,
  toFileRecord,
  type AssetPage,
  type MediaAccess,
  type MediaAsset,
} from '@/lib/media';

const PAGE_SIZE = 12;

interface Filters {
  type: string;
  tag: string;
  name: string;
}

const EMPTY_FILTERS: Filters = { type: 'all', tag: '', name: '' };

export default function MediaAssetsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [refreshToken, setRefreshToken] = useState(0);
  const [access, setAccess] = useState<MediaAccess>();
  const [result, setResult] = useState<AssetPage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchAccess(api),
      fetchAssets(api, {
        type: applied.type === 'all' ? undefined : applied.type,
        tag: applied.tag || undefined,
        name: applied.name || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    ])
      .then(([resolved, assets]) => {
        if (!active) return;
        setAccess(resolved);
        setResult(assets);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof ApiClientError
            ? cause.message
            : t('media.list.loadFailed', {
                defaultValue: 'Unable to load the media library.',
              }),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, applied, page, refreshToken, t]);

  const apply = (next: Filters): void => {
    setLoading(true);
    setPage(1);
    setApplied(next);
    setRefreshToken((current) => current + 1);
  };

  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / PAGE_SIZE))
    : 1;

  return (
    <section className='space-y-6 p-6'>
      <header className='flex flex-wrap items-start justify-between gap-3'>
        <div className='space-y-1'>
          <h1 className='font-heading text-2xl font-semibold'>
            {t('media.list.title')}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {t('media.list.description')}
          </p>
        </div>
        {access?.canManage ? (
          <Button
            render={<Link to='/media-assets/new' />}
            data-testid='media-new-asset'
          >
            <Plus aria-hidden='true' />
            {t('media.list.new')}
          </Button>
        ) : null}
      </header>

      <form
        className='grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4'
        onSubmit={(event) => {
          event.preventDefault();
          apply(filters);
        }}
      >
        <div className='space-y-2'>
          <Label htmlFor='media-filter-name'>
            {t('media.list.filterName')}
          </Label>
          <Input
            id='media-filter-name'
            value={filters.name}
            placeholder={t('media.list.filterNamePlaceholder', {
              defaultValue: 'Search by name',
            })}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='media-filter-tag'>{t('media.list.filterTag')}</Label>
          <Input
            id='media-filter-tag'
            value={filters.tag}
            placeholder={t('media.list.filterTagPlaceholder', {
              defaultValue: 'Tag',
            })}
            onChange={(event) =>
              setFilters((current) => ({ ...current, tag: event.target.value }))
            }
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='media-filter-type'>
            {t('media.list.filterType')}
          </Label>
          <Select
            value={filters.type}
            onValueChange={(value: string | null) =>
              setFilters((current) => ({ ...current, type: value ?? 'all' }))
            }
          >
            <SelectTrigger id='media-filter-type' className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('media.list.allTypes')}</SelectItem>
              {MEDIA_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`media.types.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='flex items-end gap-2'>
          <Button type='submit' data-testid='media-filter-apply'>
            <Search aria-hidden='true' />
            {t('media.list.apply')}
          </Button>
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              apply(EMPTY_FILTERS);
            }}
          >
            {t('media.list.reset')}
          </Button>
        </div>
      </form>

      {error ? (
        <p
          role='alert'
          className='rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 className='animate-spin' aria-hidden='true' />
          {t('media.list.loading')}
        </div>
      ) : result && result.items.length ? (
        <div className='overflow-x-auto rounded-xl border bg-card'>
          <table className='w-full min-w-[52rem] text-left text-sm'>
            <thead className='border-b bg-muted/30 text-xs tracking-wide text-muted-foreground uppercase'>
              <tr>
                <th className='px-4 py-3 font-medium'>
                  {t('media.list.preview')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('media.fields.name')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('media.fields.type')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('media.fields.tags')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('media.fields.size')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('media.fields.status')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('media.fields.uploadedAt')}
                </th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {result.items.map((asset) => (
                <AssetRow key={asset.id} asset={asset} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p
          role='status'
          className='rounded-xl border bg-card p-6 text-sm text-muted-foreground'
        >
          {t('media.list.empty')}
        </p>
      )}

      {result && result.total > PAGE_SIZE ? (
        <div className='flex items-center justify-between text-sm text-muted-foreground'>
          <span>
            {t('media.list.pageOf', {
              page,
              total: totalPages,
            })}
          </span>
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={page <= 1}
              onClick={() => {
                setLoading(true);
                setPage((current) => Math.max(1, current - 1));
              }}
            >
              {t('media.list.previous')}
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={page >= totalPages}
              onClick={() => {
                setLoading(true);
                setPage((current) => current + 1);
              }}
            >
              {t('media.list.next')}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AssetRow({ asset }: { readonly asset: MediaAsset }): ReactElement {
  const { t } = useTranslation();
  const record = toFileRecord(asset);
  return (
    <tr className='align-middle hover:bg-muted/30'>
      <td className='px-4 py-3'>
        <div className='h-12 w-12 overflow-hidden rounded-md border'>
          <FileThumbnail file={record} />
        </div>
      </td>
      <td className='px-4 py-3'>
        <Link
          to={`/media-assets/${asset.id}`}
          className='font-medium text-primary hover:underline'
        >
          {asset.name}
        </Link>
        <div className='text-xs text-muted-foreground'>{asset.filename}</div>
      </td>
      <td className='px-4 py-3'>
        <AssetTypeBadge type={asset.type} />
      </td>
      <td className='px-4 py-3 text-muted-foreground'>
        {asset.tags.length ? asset.tags.join(', ') : t('media.list.noTags')}
      </td>
      <td className='px-4 py-3 tabular-nums'>{formatSize(asset.size)}</td>
      <td className='px-4 py-3'>
        <AssetStatusBadge status={asset.status} />
      </td>
      <td className='px-4 py-3 text-muted-foreground'>
        {formatDate(asset.createdAt)}
      </td>
    </tr>
  );
}
