import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import { Loading } from '@/components/loading';
import { cn } from '@/lib/utils';
import {
  errorMessage,
  formatMoney,
  statusBadgeClass,
} from '@/pages/expense-claims/shared';

export interface ExpenseClaimListItem {
  readonly id: string;
  readonly claimNumber: string;
  readonly applicantId: string;
  readonly applicantName: string;
  readonly expenseType: string;
  readonly expenseDate: string;
  readonly totalAmount: number;
  readonly status: string;
  readonly itemCount: number;
  readonly createdAt: Date | string;
}

export default function ExpenseClaimsListPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const navigate = useNavigate();
  const [claims, setClaims] = useState<readonly ExpenseClaimListItem[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .request<{ data: readonly ExpenseClaimListItem[] }>({
        path: '/expense-claims',
        method: 'GET',
      })
      .then(({ data }) => {
        if (!cancelled) setClaims(data);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(errorMessage(cause, t('expenseClaims.loadFailed')));
      });
    return () => {
      cancelled = true;
    };
  }, [api, t]);

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-10'>
      <header className='flex flex-wrap items-center justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {t('expenseClaims.title')}
          </h1>
        </div>
        <Button onClick={() => void navigate('/expense-claims/new')}>
          <PlusIcon className='size-4' aria-hidden='true' />
          {t('expenseClaims.create')}
        </Button>
      </header>

      {error ? (
        <p className='text-sm text-destructive'>{error}</p>
      ) : claims === null ? (
        <Loading label={t('expenseClaims.title')} />
      ) : claims.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('expenseClaims.empty')}
        </p>
      ) : (
        <div className='overflow-x-auto rounded-lg border border-border'>
          <table className='w-full border-collapse text-sm'>
            <thead>
              <tr className='border-b border-border bg-muted/50 text-left text-muted-foreground'>
                <Th>{t('expenseClaims.claimNumber')}</Th>
                <Th>{t('expenseClaims.applicant')}</Th>
                <Th>{t('expenseClaims.expenseType')}</Th>
                <Th>{t('expenseClaims.expenseDate')}</Th>
                <Th className='text-right'>{t('expenseClaims.totalAmount')}</Th>
                <Th className='text-right'>{t('expenseClaims.itemCount')}</Th>
                <Th>{t('expenseClaims.status')}</Th>
                <Th className='text-right'>{t('expenseClaims.view')}</Th>
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr
                  key={claim.id}
                  className='border-b border-border last:border-b-0 hover:bg-muted/30'
                >
                  <Td>{claim.claimNumber}</Td>
                  <Td>{claim.applicantName}</Td>
                  <Td>{t(`expenseClaims.types.${claim.expenseType}`)}</Td>
                  <Td>{claim.expenseDate}</Td>
                  <Td className='text-right font-medium'>
                    {formatMoney(claim.totalAmount)}
                  </Td>
                  <Td className='text-right'>{claim.itemCount}</Td>
                  <Td>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs',
                        statusBadgeClass(claim.status),
                      )}
                    >
                      {t(`expenseClaims.statuses.${claim.status}`)}
                    </span>
                  </Td>
                  <Td className='text-right'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() =>
                        void navigate(`/expense-claims/${claim.id}`)
                      }
                    >
                      {t('expenseClaims.view')}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Th({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: React.ReactNode;
}): ReactElement {
  return (
    <th className={cn('px-4 py-3 font-medium whitespace-nowrap', className)}>
      {children}
    </th>
  );
}

function Td({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: React.ReactNode;
}): ReactElement {
  return (
    <td className={cn('px-4 py-3 whitespace-nowrap', className)}>{children}</td>
  );
}
