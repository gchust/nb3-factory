import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { ClaimTable } from '@/components/expense/claim-widgets.js';
import { useExpenseApi } from '@/components/expense/use-api.js';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { ClaimRecord } from '@/lib/expense-api';

export default function ClaimsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useExpenseApi();
  const navigate = useNavigate();
  const [claims, setClaims] = useState<readonly ClaimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .claims()
      .then((rows) => {
        if (active) setClaims(rows);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : t('expense.error.load'),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, t]);

  return (
    <section className='space-y-6 p-6'>
      <header className='flex items-center justify-between gap-4'>
        <div>
          <h1 className='font-heading text-2xl font-semibold'>
            {t('expense.claims.title')}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {t('expense.claims.subtitle')}
          </p>
        </div>
        <Button
          onClick={() => {
            void navigate('/expenses/claims/new');
          }}
        >
          <PlusIcon />
          {t('expense.claims.new')}
        </Button>
      </header>

      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      {loading ? (
        <Spinner />
      ) : (
        <ClaimTable
          claims={claims}
          onOpen={(claim) => {
            void navigate(`/expenses/claims/${claim.id}`);
          }}
          empty={t('expense.claims.empty')}
        />
      )}
    </section>
  );
}
