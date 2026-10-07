import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import {
  DownloadIcon,
  FileSpreadsheetIcon,
  LoaderCircleIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Progress, ProgressValue } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  fetchExport,
  exportDownloadUrl,
  listExports,
  startExport,
} from './claim-api.js';
import { formatBytes, formatDateTime } from './claim-format.js';
import { ExportStatusBadge } from './claim-status-badge.js';
import type { ClaimFilters, ExportJob } from './types.js';

const POLL_INTERVAL_MS = 1200;
const VISIBLE_JOBS = 5;

/**
 * Batch export, inline on the list page.
 *
 * Starting an export answers immediately with a job; the work runs on the server. The panel polls it and shows
 * progress here rather than in a modal, so the user can keep working while it runs. When the job completes the panel
 * offers the CSV; the file is produced from live data at download time and the URL includes the job id, so the link
 * only ever downloads the requester's own job.
 */
export function ExportPanel({
  filters,
  labels,
}: {
  readonly filters: ClaimFilters;
  /** Resolves the filter labels the current export was started with, for the job row. */
  readonly labels: string;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const [jobs, setJobs] = useState<readonly ExportJob[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // Read by the poll callback without retriggering the effect on every render. Synced in an effect rather than during
  // render: writing a ref while rendering is not a side effect React permits.
  const jobsRef = useRef(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  // List the caller's recent jobs once, so a page reload still shows an export that is still running.
  useEffect(() => {
    const controller = new AbortController();
    listExports(api, controller.signal).then(
      ({ data }) => {
        if (!controller.signal.aborted) {
          setJobs(data);
        }
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [api]);

  const start = useCallback(async (): Promise<void> => {
    setStarting(true);
    setError(undefined);
    try {
      const job = await startExport(api, filters);
      setJobs((current) => [job, ...current].slice(0, VISIBLE_JOBS));
    } catch (reason) {
      setError(
        reason instanceof ApiClientError
          ? t('expense.export.startFailed', {
              reason: reason.reason ?? reason.message,
            })
          : t('expense.error.requestFailed'),
      );
    } finally {
      setStarting(false);
    }
  }, [api, filters, t]);

  // Poll while any visible job is unfinished. The interval is re-created when the set of unfinished jobs changes.
  const unfinished = jobs.some(
    (job) => job.status === 'pending' || job.status === 'running',
  );
  useEffect(() => {
    if (!unfinished) {
      return undefined;
    }
    let cancelled = false;
    const timer = window.setInterval(() => {
      const active = jobsRef.current.filter(
        (job) => job.status === 'pending' || job.status === 'running',
      );
      void Promise.all(
        active.map((job) => fetchExport(api, job.id).catch(() => undefined)),
      ).then((fresh) => {
        if (cancelled) {
          return;
        }
        const byId = new Map(
          fresh.filter((job) => job !== undefined).map((job) => [job.id, job]),
        );
        setJobs((current) => current.map((job) => byId.get(job.id) ?? job));
      });
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [api, unfinished]);

  const recent = jobs.slice(0, VISIBLE_JOBS);

  return (
    <section className='space-y-3 rounded-xl border bg-card p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <FileSpreadsheetIcon
            aria-hidden='true'
            className='size-4 text-muted-foreground'
          />
          <h2 className='text-base font-medium'>{t('expense.export.title')}</h2>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={starting}
          onClick={() => void start()}
        >
          {starting ? (
            <LoaderCircleIcon
              className='animate-spin'
              data-icon='inline-start'
            />
          ) : (
            <DownloadIcon data-icon='inline-start' />
          )}
          {t('expense.export.start')}
        </Button>
      </div>
      <p className='text-sm text-muted-foreground'>
        {t('expense.export.description', { filters: labels })}
      </p>
      {error ? <p className='text-sm text-destructive'>{error}</p> : null}
      {recent.length ? (
        <ul className='space-y-2'>
          {recent.map((job) => (
            <li key={job.id} className='rounded-lg border p-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex items-center gap-2'>
                  <ExportStatusBadge status={job.status} />
                  <span className='text-sm text-muted-foreground'>
                    {formatDateTime(job.createdAt, locale) ??
                      t('expense.export.justNow')}
                  </span>
                </div>
                {job.status === 'completed' ? (
                  // A plain anchor: the download is a browser navigation that streams the CSV and carries the
                  // session cookie. `buttonVariants` gives it the link styling without a button element.
                  <a
                    className={cn(
                      buttonVariants({ variant: 'link', size: 'sm' }),
                    )}
                    href={exportDownloadUrl(job.id)}
                    download={job.resultFilename ?? undefined}
                  >
                    <DownloadIcon data-icon='inline-start' />
                    {t('expense.export.download', {
                      size: formatBytes(job.resultSize),
                    })}
                  </a>
                ) : null}
              </div>
              {job.status === 'failed' ? (
                <p className='mt-2 text-sm text-destructive'>
                  {job.error ?? t('expense.export.failed')}
                </p>
              ) : (
                <div className='mt-2 space-y-1'>
                  <Progress value={job.progress}>
                    <span className='text-xs text-muted-foreground'>
                      {job.total > 0
                        ? t('expense.export.progressDetail', {
                            processed: job.processed,
                            total: job.total,
                          })
                        : t('expense.export.waiting')}
                    </span>
                    <ProgressValue />
                  </Progress>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
