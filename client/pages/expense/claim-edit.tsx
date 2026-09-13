import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';

import { ClaimForm } from '@/components/expense/claim-form.js';
import { useExpenseApi } from '@/components/expense/use-api.js';
import { Spinner } from '@/components/ui/spinner';
import type { ClaimRecord } from '@/lib/expense-api';

export default function ClaimEditPage(): ReactElement {
  const { t } = useTranslation();
  const api = useExpenseApi();
  const navigate = useNavigate();
  const { id } = useParams();
  const [claim, setClaim] = useState<ClaimRecord>();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const claimId = Number(id);
    api
      .claim(claimId)
      .then((row) => {
        if (active) setClaim(row);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : t('expense.error.load'),
          );
      });
    return () => {
      active = false;
    };
  }, [api, id, t]);

  return (
    <section className='space-y-6 p-6'>
      <h1 className='font-heading text-2xl font-semibold'>
        {t('expense.claims.edit')}
      </h1>
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      {!claim && !error && <Spinner />}
      {claim && (
        <ClaimForm
          mode='edit'
          claim={claim}
          onSaved={(saved) => {
            void navigate(`/expenses/claims/${saved.id}`);
          }}
          onCancel={() => {
            void navigate(`/expenses/claims/${claim.id}`);
          }}
        />
      )}
    </section>
  );
}
