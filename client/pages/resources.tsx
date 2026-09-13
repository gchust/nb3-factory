import { useTranslation } from '@nocobase/i18n/client';
import { useService, apiClientToken } from '@nocobase/app-client';
import { Plus } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import { Loading } from '@/components/loading';
import { ResourceCover } from '@/components/resource-cover';
import { Button } from '@/components/ui/button';
import { listResources, type ResourceView } from '@/lib/resource-center-api';

export default function ResourcesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const navigate = useNavigate();
  const [resources, setResources] = useState<readonly ResourceView[] | null>(
    null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    listResources(api)
      .then((data) => {
        if (active) setResources(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [api]);

  return (
    <section className='mx-auto w-full max-w-5xl space-y-6 px-6 py-8'>
      <header className='flex flex-wrap items-start justify-between gap-3'>
        <div className='space-y-1'>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {t('resources.title')}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {t('resources.description')}
          </p>
        </div>
        <Button
          type='button'
          onClick={() => {
            void navigate('/resources/new');
          }}
        >
          <Plus aria-hidden='true' />
          {t('resources.new')}
        </Button>
      </header>

      {failed ? (
        <p role='alert' className='text-sm text-destructive'>
          {t('resources.loadError')}
        </p>
      ) : resources === null ? (
        <Loading label={t('resources.loading')} />
      ) : resources.length === 0 ? (
        <div
          role='status'
          className='rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground'
        >
          {t('resources.empty')}
        </div>
      ) : (
        <ul className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {resources.map((resource) => (
            <li key={resource.id}>
              <Link
                to={`/resources/${resource.id}`}
                className='group block h-full overflow-hidden rounded-lg border bg-card transition-colors hover:border-ring'
              >
                <ResourceCover
                  file={resource.cover}
                  emptyLabel={t('resources.noCover')}
                  className='h-40 rounded-b-none border-0 border-b'
                />
                <div className='space-y-2 p-3'>
                  <h2 className='truncate font-heading text-base font-medium group-hover:text-primary'>
                    {resource.title}
                  </h2>
                  <span className='inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'>
                    {resource.category}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
