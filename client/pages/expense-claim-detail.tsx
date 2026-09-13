import { useEffect, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeftIcon, DownloadIcon, FileTextIcon } from 'lucide-react';
import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';

import { Button } from '@/components/ui/button';
import { Loading } from '@/components/loading';
import {
  fetchExpenseClaim,
  fileKindLabel,
  formatAmount,
  formatFileSize,
  type ExpenseClaim,
} from '@/lib/expense-claims';

export default function ExpenseClaimDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const params = useParams();
  const claimId = Number(params.id);
  const validId = Number.isInteger(claimId) && claimId > 0;

  const [claim, setClaim] = useState<ExpenseClaim | undefined>(undefined);
  const [loading, setLoading] = useState(validId);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!validId) return;
    let active = true;
    fetchExpenseClaim(api, claimId).then(
      (data) => {
        if (!active) return;
        setClaim(data);
        setError('');
        setLoading(false);
      },
      (cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : t('expenseClaims.loadFailed'),
        );
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [api, claimId, reloadToken, t, validId]);

  function reload(): void {
    setLoading(true);
    setError('');
    setReloadToken((token) => token + 1);
  }

  const failure = validId ? error : t('expenseClaims.notFound');

  return (
    <section className='mx-auto w-full max-w-4xl space-y-6 px-6 py-10'>
      <Link
        className='inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline'
        to='/expense-claims'
      >
        <ArrowLeftIcon aria-hidden='true' className='size-4' />
        {t('expenseClaims.backToList')}
      </Link>

      {loading ? (
        <Loading className='py-16' label={t('expenseClaims.loading')} />
      ) : null}

      {!loading && failure ? (
        <div
          className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive'
          role='alert'
        >
          <span>{failure}</span>
          {validId ? (
            <Button size='sm' type='button' variant='outline' onClick={reload}>
              {t('expenseClaims.retry')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {!loading && !failure && claim ? (
        <>
          <header className='space-y-2'>
            <h1 className='font-heading text-2xl font-semibold tracking-tight'>
              {claim.reason}
            </h1>
            <dl className='flex flex-wrap gap-x-8 gap-y-2 text-sm'>
              <div className='space-y-0.5'>
                <dt className='text-muted-foreground'>
                  {t('expenseClaims.fields.amount')}
                </dt>
                <dd className='font-medium tabular-nums'>
                  ¥{formatAmount(claim.amount)}
                </dd>
              </div>
              <div className='space-y-0.5'>
                <dt className='text-muted-foreground'>
                  {t('expenseClaims.fields.date')}
                </dt>
                <dd className='font-medium'>{claim.expenseDate}</dd>
              </div>
              <div className='space-y-0.5'>
                <dt className='text-muted-foreground'>
                  {t('expenseClaims.fields.attachments')}
                </dt>
                <dd className='font-medium tabular-nums'>
                  {claim.attachments.length}
                </dd>
              </div>
            </dl>
          </header>

          <div className='space-y-3'>
            <h2 className='font-heading text-lg font-medium'>
              {t('expenseClaims.attachments.title')}
            </h2>
            {claim.attachments.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('expenseClaims.attachments.empty')}
              </p>
            ) : (
              <ul className='divide-y divide-border rounded-lg border border-border'>
                {claim.attachments.map((attachment) => (
                  <li
                    className='flex flex-wrap items-center gap-3 px-4 py-3'
                    key={attachment.id}
                  >
                    {attachment.mimeType.startsWith('image/') ? (
                      <img
                        alt={attachment.filename}
                        className='size-12 shrink-0 rounded-md border border-border object-cover'
                        src={attachment.contentUrl}
                      />
                    ) : (
                      <span className='grid size-12 shrink-0 place-items-center rounded-md border border-border bg-muted text-muted-foreground'>
                        <FileTextIcon aria-hidden='true' className='size-5' />
                      </span>
                    )}
                    <div className='min-w-0 flex-1'>
                      <p className='truncate text-sm font-medium'>
                        {attachment.filename}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {fileKindLabel(attachment)} ·{' '}
                        {formatFileSize(attachment.size)}
                      </p>
                    </div>
                    <a
                      className='inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline'
                      download={attachment.filename}
                      href={attachment.contentUrl}
                    >
                      <DownloadIcon aria-hidden='true' className='size-4' />
                      {t('expenseClaims.attachments.download')}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
