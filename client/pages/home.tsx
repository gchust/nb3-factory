import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface BuildInfo {
  readonly name: string;
  readonly startedAt: string;
  readonly nodeVersion: string;
}

interface BuildInfoResponse {
  readonly data: BuildInfo;
}

interface VisitCountResponse {
  readonly data: { readonly count: number };
}

type RequestState = 'loading' | 'ready' | 'error';

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const [reloadToken, setReloadToken] = useState(0);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [buildInfoState, setBuildInfoState] = useState<RequestState>('loading');
  const [count, setCount] = useState<number | null>(null);
  const [countState, setCountState] = useState<RequestState>('loading');

  useEffect(() => {
    let active = true;
    api
      .request<BuildInfoResponse>({ path: 'preview-smoke/info' })
      .then((response) => {
        if (!active) return;
        setBuildInfo(response.data);
        setBuildInfoState('ready');
      })
      .catch(() => {
        if (active) setBuildInfoState('error');
      });
    return () => {
      active = false;
    };
  }, [api, reloadToken]);

  useEffect(() => {
    let active = true;
    api
      .request<VisitCountResponse>({
        method: 'POST',
        path: 'preview-smoke/visits',
      })
      .then((response) => {
        if (!active) return;
        setCount(response.data.count);
        setCountState('ready');
      })
      .catch(() => {
        if (active) setCountState('error');
      });
    return () => {
      active = false;
    };
  }, [api, reloadToken]);

  const retry = (): void => {
    setBuildInfoState('loading');
    setCountState('loading');
    setReloadToken((token) => token + 1);
  };

  return (
    <section className='mx-auto w-full max-w-3xl space-y-6 px-6 py-10'>
      <header className='space-y-2'>
        <h1 className='font-heading text-3xl font-semibold tracking-tight'>
          {t('home.title')}
        </h1>
        <p className='text-muted-foreground'>{t('home.description')}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('home.buildInfo.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {buildInfoState === 'ready' && buildInfo ? (
            <dl className='grid gap-3 text-sm'>
              <DetailRow
                label={t('home.buildInfo.name')}
                value={buildInfo.name}
              />
              <DetailRow
                label={t('home.buildInfo.startedAt')}
                value={formatStartedAt(buildInfo.startedAt)}
              />
              <DetailRow
                label={t('home.buildInfo.nodeVersion')}
                value={buildInfo.nodeVersion}
              />
            </dl>
          ) : buildInfoState === 'error' ? (
            <RequestError
              message={t('home.buildInfo.error')}
              onRetry={retry}
              retryLabel={t('home.retry')}
            />
          ) : (
            <Loading
              className='justify-start'
              label={t('home.buildInfo.loading')}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('home.visits.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {countState === 'ready' && count !== null ? (
            <div className='flex items-baseline gap-3'>
              <span className='font-heading text-4xl font-semibold tabular-nums'>
                {count}
              </span>
              <span className='text-sm text-muted-foreground'>
                {t('home.visits.label')}
              </span>
            </div>
          ) : countState === 'error' ? (
            <RequestError
              message={t('home.visits.error')}
              onRetry={retry}
              retryLabel={t('home.retry')}
            />
          ) : (
            <Loading
              className='justify-start'
              label={t('home.visits.loading')}
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function DetailRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 last:border-b-0 last:pb-0'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='font-medium break-all'>{value}</dd>
    </div>
  );
}

function RequestError({
  message,
  onRetry,
  retryLabel,
}: {
  readonly message: string;
  readonly onRetry: () => void;
  readonly retryLabel: string;
}): ReactElement {
  return (
    <div className='flex flex-wrap items-center justify-between gap-3 text-sm text-destructive'>
      <span>{message}</span>
      <Button onClick={onRetry} size='sm' variant='outline'>
        {retryLabel}
      </Button>
    </div>
  );
}

function formatStartedAt(value: string): string {
  const startedAt = new Date(value);
  return Number.isNaN(startedAt.getTime()) ? value : startedAt.toLocaleString();
}
