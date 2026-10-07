import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Link, useLocation } from 'react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

import {
  decideSuggestion,
  fetchDashboard,
  fetchSuggestions,
  generateSuggestions,
} from './api.js';
import {
  OverdueBadge,
  RequestError,
  SuggestionKindBadge,
} from './components.js';
import {
  followUpIsOverdue,
  formatAmount,
  formatDateTime,
  METHOD_LABEL_KEYS,
  STAGE_LABEL_KEYS,
} from './format.js';
import { useLoad } from './use-load.js';
import {
  OPPORTUNITY_STAGES,
  type FollowUpView,
  type SuggestionView,
} from './types.js';

export default function CrmDashboardPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const canSuggest = useCan({
    resource: { type: 'composite', id: 'crm' },
    action: 'suggest',
  });

  const { data, error, loading, reload } = useLoad(
    (signal) => fetchDashboard(api, signal),
    'dashboard',
  );

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button
            nativeButton={false}
            render={
              <Link
                to={{ pathname: '/crm/customers', search: location.search }}
              />
            }
            variant='outline'
          >
            {t('crm.dashboard.viewCustomers')}
          </Button>
        }
        description={t('crm.dashboard.description')}
        title={t('crm.dashboard.title')}
      />

      {error ? <RequestError error={error} onRetry={reload} /> : null}
      {loading && !data ? (
        <p className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Spinner /> {t('crm.loading')}
        </p>
      ) : null}

      {data ? (
        <>
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            {OPPORTUNITY_STAGES.map((stage) => {
              const summary = data.stages.find(
                (entry) => entry.stage === stage,
              );
              return (
                <Card key={stage}>
                  <CardHeader>
                    <CardTitle>{t(STAGE_LABEL_KEYS[stage])}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className='text-3xl font-semibold'>
                      {summary?.count ?? 0}
                    </p>
                    <p className='mt-1 text-sm text-muted-foreground'>
                      {formatAmount(summary?.amount ?? 0)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            <Metric
              label={t('crm.dashboard.metric.totalOpportunities')}
              value={String(data.totalOpportunities)}
            />
            <Metric
              label={t('crm.dashboard.metric.openAmount')}
              value={formatAmount(data.openAmount)}
            />
            <Metric
              label={t('crm.dashboard.metric.wonAmount')}
              value={formatAmount(data.wonAmount)}
            />
            <Metric
              label={t('crm.dashboard.metric.customerCount')}
              value={String(data.customerCount)}
            />
            <Metric
              label={t('crm.dashboard.metric.pendingFollowUps')}
              value={String(data.pendingFollowUpCount)}
            />
            <Metric
              label={t('crm.dashboard.metric.overdueFollowUps')}
              value={String(data.overdueFollowUpCount)}
            />
            <Metric
              label={t('crm.dashboard.metric.lostCount')}
              value={String(data.lostCount)}
            />
            <Metric
              label={t('crm.dashboard.metric.pendingSuggestions')}
              value={String(data.pendingSuggestionCount)}
            />
          </div>

          <div className='grid gap-6 lg:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle>{t('crm.dashboard.thisWeek')}</CardTitle>
              </CardHeader>
              <CardContent>
                <FollowUpList
                  empty={t('crm.dashboard.noThisWeek')}
                  followUps={data.followUpsThisWeek}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('crm.dashboard.overdue')}</CardTitle>
              </CardHeader>
              <CardContent>
                <FollowUpList
                  empty={t('crm.dashboard.noOverdue')}
                  followUps={data.overdueFollowUps}
                />
              </CardContent>
            </Card>
          </div>

          {canSuggest.can ? <SuggestionsPanel onChanged={reload} /> : null}
        </>
      ) : null}
    </PageContainer>
  );
}

function Metric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <Card size='sm'>
      <CardContent>
        <p className='text-xs text-muted-foreground'>{label}</p>
        <p className='mt-1 text-xl font-semibold'>{value}</p>
      </CardContent>
    </Card>
  );
}

function FollowUpList({
  followUps,
  empty,
}: {
  readonly followUps: readonly FollowUpView[];
  readonly empty: string;
}): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  if (followUps.length === 0) {
    return <p className='text-sm text-muted-foreground'>{empty}</p>;
  }
  return (
    <ul className='divide-y divide-border'>
      {followUps.map((followUp) => (
        <li
          className='flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0'
          key={followUp.id}
        >
          <div className='min-w-0'>
            <p className='truncate text-sm font-medium'>
              {followUp.customerId ? (
                <Link
                  className='underline-offset-4 hover:underline'
                  to={{
                    pathname: `/crm/customers/${followUp.customerId}`,
                    search: location.search,
                  }}
                >
                  {followUp.customerName ?? followUp.customerId}
                </Link>
              ) : (
                '—'
              )}
            </p>
            <p className='truncate text-xs text-muted-foreground'>
              {followUp.content ||
                (METHOD_LABEL_KEYS[followUp.method]
                  ? t(METHOD_LABEL_KEYS[followUp.method])
                  : followUp.method)}
            </p>
          </div>
          <div className='flex shrink-0 items-center gap-2 text-xs text-muted-foreground'>
            {formatDateTime(followUp.dueAt)}
            {followUpIsOverdue(followUp) ? <OverdueBadge /> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function SuggestionsPanel({
  onChanged,
}: {
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const {
    data,
    error: loadError,
    loading,
    reload,
  } = useLoad<SuggestionView[]>(
    (signal) => fetchSuggestions(api, 'pending', signal),
    'suggestions',
  );

  const suggestions = data ?? [];

  const generate = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await generateSuggestions(api);
      reload();
      onChanged();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (
    suggestion: SuggestionView,
    decision: 'approve' | 'dismiss',
  ): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await decideSuggestion(api, suggestion.id, decision);
      reload();
      onChanged();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('crm.suggestions.title')}</CardTitle>
        <CardAction>
          <Button
            disabled={busy}
            onClick={() => void generate()}
            size='sm'
            variant='outline'
          >
            {busy ? <Spinner data-icon='inline-start' /> : null}
            {t('crm.suggestions.generate')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='space-y-3'>
        <p className='text-sm text-muted-foreground'>
          {t('crm.suggestions.description')}
        </p>
        {loadError ? <RequestError error={loadError} onRetry={reload} /> : null}
        {error ? <RequestError error={error} /> : null}
        {loading && suggestions.length === 0 ? (
          <p className='text-sm text-muted-foreground'>{t('crm.loading')}</p>
        ) : null}
        {!loading && suggestions.length === 0 && !loadError ? (
          <p className='text-sm text-muted-foreground'>
            {t('crm.suggestions.empty')}
          </p>
        ) : null}
        <ul className='space-y-3'>
          {suggestions.map((suggestion) => (
            <li
              className='flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between'
              key={suggestion.id}
            >
              <div className='min-w-0 space-y-1'>
                <div className='flex items-center gap-2'>
                  <SuggestionKindBadge kind={suggestion.kind} />
                  {suggestion.customerId ? (
                    <Link
                      className='text-sm font-medium underline-offset-4 hover:underline'
                      to={{
                        pathname: `/crm/customers/${suggestion.customerId}`,
                        search: location.search,
                      }}
                    >
                      {suggestion.customerName ?? suggestion.customerId}
                    </Link>
                  ) : null}
                </div>
                <p className='text-sm text-muted-foreground'>
                  {suggestion.detail}
                </p>
              </div>
              <div className='flex shrink-0 gap-2'>
                <Button
                  disabled={busy}
                  onClick={() => void decide(suggestion, 'approve')}
                  size='sm'
                >
                  {t('crm.suggestions.approve')}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void decide(suggestion, 'dismiss')}
                  size='sm'
                  variant='outline'
                >
                  {t('crm.suggestions.dismiss')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
