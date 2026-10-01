import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, PlusIcon, TargetIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet, useSearchParams } from 'react-router';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { fetchOpportunities } from '../crm/crm-api.js';
import { SearchInput } from '../crm/search-input.js';
import {
  OPPORTUNITY_STAGES,
  type ListOutletContext,
  type Opportunity,
  type OpportunityStage,
} from '../crm/types.js';
import { useListParams } from '../crm/use-list-params.js';
import { OpportunityTable } from './opportunity-table.js';

const STAGE_PARAM = 'stage';

function isOpportunityStage(value: string | null): value is OpportunityStage {
  return OPPORTUNITY_STAGES.some((stage) => stage === value);
}

export default function OpportunitiesPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const params = useListParams();
  const [searchParams] = useSearchParams();

  const stageParam = searchParams.get(STAGE_PARAM);
  const stage = isOpportunityStage(stageParam) ? stageParam : undefined;
  const search = params.search;

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([search, stage ?? null, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Opportunity[];
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([search, stage ?? null, reloadCount]);
    fetchOpportunities(api, { search, stage }, controller.signal).then(
      (rows) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          rows,
          filtered: search !== '' || stage !== undefined,
        });
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        setResult((previous) => ({ ...previous, key, error: caught }));
      },
    );
    return () => controller.abort();
  }, [api, search, stage, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  const rowsFiltered = result?.filtered ?? false;

  const outletContext = useMemo<ListOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const stageItems = [
    { value: 'all', label: t('crm.opportunity.filters.allStages') },
    ...OPPORTUNITY_STAGES.map((value) => ({
      value,
      label: t(`crm.stage.${value}`),
    })),
  ];

  const hasFilters = params.hasSearchText || stage !== undefined;

  function clearFilters(): void {
    params.clearSearch();
    params.setParam(STAGE_PARAM, null);
  }

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
            : t('crm.opportunity.error.requestFailed')}
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
            <TargetIcon />
          </EmptyMedia>
          <EmptyTitle>{t('crm.opportunity.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('crm.opportunity.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant='outline'
            nativeButton={false}
            render={<Link to={{ pathname: 'new' }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('crm.opportunity.create.action')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <OpportunityTable
        interactive
        data={rows}
        locale={locale}
        emptyMessage={
          <div className='flex flex-col items-center gap-2'>
            <span>{t('crm.opportunity.empty.noResults')}</span>
            <Button variant='link' size='sm' onClick={clearFilters}>
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
        title={t('crm.opportunity.title')}
        description={t('crm.opportunity.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new' }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('crm.opportunity.create.action')}
          </Button>
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <SearchInput
          value={params.text}
          onChange={(value) => params.onSearchInput(value, false)}
          onCompositionEnd={params.onSearchCommit}
          placeholder={t('crm.opportunity.search.placeholder')}
          label={t('crm.opportunity.search.label')}
        />
        <Select
          items={stageItems}
          value={stage ?? 'all'}
          onValueChange={(value) =>
            params.setParam(
              STAGE_PARAM,
              value && value !== 'all' ? value : null,
            )
          }
        >
          <SelectTrigger
            className='w-40'
            aria-label={t('crm.opportunity.filters.stage')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {stageItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters ? (
          <Button variant='ghost' onClick={clearFilters}>
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
          <Skeleton className='h-5 w-16 rounded-full' />
        </div>
      ))}
    </div>
  );
}
