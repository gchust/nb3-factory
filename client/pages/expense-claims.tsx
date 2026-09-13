import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import { PlusIcon, ReceiptTextIcon } from 'lucide-react';
import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';

import { Button } from '@/components/ui/button';
import { Loading } from '@/components/loading';
import { ExpenseClaimForm } from '@/components/expense-claim-form';
import {
  fetchExpenseClaims,
  formatAmount,
  type ExpenseClaimSummary,
} from '@/lib/expense-claims';

export default function ExpenseClaimsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);

  const [claims, setClaims] = useState<readonly ExpenseClaimSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    fetchExpenseClaims(api).then(
      (data) => {
        if (!active) return;
        setClaims(data);
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
  }, [api, reloadToken, t]);

  function reload(): void {
    setLoading(true);
    setError('');
    setReloadToken((token) => token + 1);
  }

  return (
    <section className='mx-auto w-full max-w-5xl space-y-6 px-6 py-10'>
      <header className='flex flex-wrap items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {t('expenseClaims.title')}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {t('expenseClaims.description')}
          </p>
        </div>
        <Button
          type='button'
          onClick={() => setShowForm((current) => !current)}
        >
          <PlusIcon aria-hidden='true' />
          {t('expenseClaims.new')}
        </Button>
      </header>

      {showForm ? (
        <ExpenseClaimForm
          onCancel={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      ) : null}

      {error ? (
        <div
          className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive'
          role='alert'
        >
          <span>{error}</span>
          <Button size='sm' type='button' variant='outline' onClick={reload}>
            {t('expenseClaims.retry')}
          </Button>
        </div>
      ) : null}

      {loading ? (
        <Loading className='py-16' label={t('expenseClaims.loading')} />
      ) : null}

      {!loading && !error && claims.length === 0 ? (
        <div className='flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center'>
          <ReceiptTextIcon
            aria-hidden='true'
            className='size-8 text-muted-foreground'
          />
          <p className='text-sm text-muted-foreground'>
            {t('expenseClaims.empty')}
          </p>
        </div>
      ) : null}

      {!loading && claims.length > 0 ? (
        <div className='overflow-hidden rounded-lg border border-border'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 text-muted-foreground'>
              <tr>
                <th className='px-4 py-2.5 text-left font-medium'>
                  {t('expenseClaims.table.reason')}
                </th>
                <th className='px-4 py-2.5 text-right font-medium'>
                  {t('expenseClaims.table.amount')}
                </th>
                <th className='px-4 py-2.5 text-left font-medium'>
                  {t('expenseClaims.table.date')}
                </th>
                <th className='px-4 py-2.5 text-right font-medium'>
                  {t('expenseClaims.table.attachments')}
                </th>
              </tr>
            </thead>
            <tbody className='divide-y divide-border'>
              {claims.map((claim) => (
                <tr className='hover:bg-muted/40' key={claim.id}>
                  <td className='px-4 py-3'>
                    <Link
                      className='font-medium text-foreground underline-offset-4 hover:text-primary hover:underline'
                      to={`/expense-claims/${claim.id}`}
                    >
                      {claim.reason}
                    </Link>
                  </td>
                  <td className='px-4 py-3 text-right tabular-nums'>
                    ¥{formatAmount(claim.amount)}
                  </td>
                  <td className='px-4 py-3 text-muted-foreground'>
                    {claim.expenseDate}
                  </td>
                  <td className='px-4 py-3 text-right tabular-nums text-muted-foreground'>
                    {claim.attachmentCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
