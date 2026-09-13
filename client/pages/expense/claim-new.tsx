import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { ClaimForm } from '@/components/expense/claim-form.js';

export default function ClaimNewPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <section className='space-y-6 p-6'>
      <h1 className='font-heading text-2xl font-semibold'>
        {t('expense.claims.new')}
      </h1>
      <ClaimForm
        mode='create'
        onSaved={(claim) => {
          void navigate(`/expenses/claims/${claim.id}`);
        }}
        onCancel={() => {
          void navigate('/expenses/claims');
        }}
      />
    </section>
  );
}
