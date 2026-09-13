import { useService, apiClientToken } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, Download } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { Loading } from '@/components/loading';
import { ResourceCover } from '@/components/resource-cover';
import { Button } from '@/components/ui/button';
import { formatFileSize, fileSizeUnits } from '@/lib/file-utils';
import { getResource, type ResourceView } from '@/lib/resource-center-api';

export default function ResourceDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const { id = '' } = useParams<{ id: string }>();
  const [result, setResult] = useState<{
    readonly id: string;
    readonly resource: ResourceView | null;
  } | null>(null);

  useEffect(() => {
    let active = true;
    getResource(api, id)
      .then((data) => {
        if (active) setResult({ id, resource: data });
      })
      .catch(() => {
        if (active) setResult({ id, resource: null });
      });
    return () => {
      active = false;
    };
  }, [api, id]);

  if (!result || result.id !== id) {
    return (
      <section className='mx-auto w-full max-w-3xl px-6 py-8'>
        <Loading label={t('resources.loading')} />
      </section>
    );
  }

  if (!result.resource) {
    return (
      <section className='mx-auto w-full max-w-3xl space-y-4 px-6 py-8'>
        <p role='alert' className='text-sm text-destructive'>
          {t('resources.notFound')}
        </p>
        <Link
          to='/resources'
          className='inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline'
        >
          <ArrowLeft aria-hidden='true' className='size-4' />
          {t('resources.backToList')}
        </Link>
      </section>
    );
  }

  const resource = result.resource;

  return (
    <section className='mx-auto w-full max-w-3xl space-y-6 px-6 py-8'>
      <Link
        to='/resources'
        className='inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline'
      >
        <ArrowLeft aria-hidden='true' className='size-4' />
        {t('resources.backToList')}
      </Link>

      <header className='space-y-2'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {resource.title}
        </h1>
        <span className='inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'>
          {resource.category}
        </span>
      </header>

      <div className='space-y-2'>
        <h2 className='font-heading text-base font-medium'>
          {t('resources.fields.cover')}
        </h2>
        <ResourceCover
          file={resource.cover}
          emptyLabel={t('resources.noCover')}
          className='h-64 w-full'
        />
      </div>

      <div className='space-y-2'>
        <h2 className='font-heading text-base font-medium'>
          {t('resources.fields.document')}
        </h2>
        {resource.document ? (
          <div className='flex flex-wrap items-center justify-between gap-3 rounded-md border p-3'>
            <div className='min-w-0 space-y-0.5'>
              <p
                className='truncate text-sm font-medium'
                title={resource.document.filename}
              >
                {resource.document.filename}
              </p>
              <p className='text-xs text-muted-foreground'>
                {formatFileSize(resource.document.size, fileSizeUnits(t))}
              </p>
            </div>
            <Button
              render={
                <a
                  href={resource.document.contentUrl}
                  download={resource.document.filename}
                />
              }
            >
              <Download aria-hidden='true' />
              {t('resources.download')}
            </Button>
          </div>
        ) : (
          <p className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
            {t('resources.noDocument')}
          </p>
        )}
      </div>
    </section>
  );
}
