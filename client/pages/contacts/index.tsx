import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, PlusIcon, UsersIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { fetchContacts } from '../crm/crm-api.js';
import { SearchInput } from '../crm/search-input.js';
import type { Contact, ListOutletContext } from '../crm/types.js';
import { useListParams } from '../crm/use-list-params.js';
import { ContactTable } from './contact-table.js';

export default function ContactsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const params = useListParams();
  const search = params.search;

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([search, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Contact[];
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([search, reloadCount]);
    fetchContacts(api, { search }, controller.signal).then(
      (rows) => {
        if (controller.signal.aborted) return;
        setResult({ key, rows, filtered: search !== '' });
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        setResult((previous) => ({ ...previous, key, error: caught }));
      },
    );
    return () => controller.abort();
  }, [api, search, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  const rowsFiltered = result?.filtered ?? false;

  const outletContext = useMemo<ListOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const hasFilters = params.hasSearchText;

  let content: ReactElement;
  if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('crm.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('crm.error.forbidden')
            : t('crm.contact.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={() => reload()}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (rows === undefined) {
    content = <TableSkeleton label={t('status.loading')} />;
  } else if (rows.length === 0 && !rowsFiltered) {
    content = (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>{t('crm.contact.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('crm.contact.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant='outline'
            nativeButton={false}
            render={<Link to={{ pathname: 'new' }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('crm.contact.create.action')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <ContactTable
        interactive
        data={rows}
        emptyMessage={
          <div className='flex flex-col items-center gap-2'>
            <span>{t('crm.contact.empty.noResults')}</span>
            <Button variant='link' size='sm' onClick={params.clearSearch}>
              {t('crm.filters.clear')}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.contact.title')}
        description={t('crm.contact.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new' }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('crm.contact.create.action')}
          </Button>
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <SearchInput
          value={params.text}
          onChange={params.onSearchInput}
          onCompositionEnd={params.onSearchCommit}
          placeholder={t('crm.contact.search.placeholder')}
          label={t('crm.contact.search.label')}
        />
        {hasFilters ? (
          <Button variant='ghost' onClick={params.clearSearch}>
            {t('crm.filters.clear')}
          </Button>
        ) : null}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function TableSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <div
      role='status'
      aria-label={label}
      className='overflow-hidden rounded-lg border'
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className='flex items-center gap-4 border-b px-4 py-3 last:border-b-0'
        >
          <Skeleton className='h-4 w-40' />
          <Skeleton className='h-4 w-24' />
          <Skeleton className='ml-auto h-4 w-20' />
        </div>
      ))}
    </div>
  );
}
