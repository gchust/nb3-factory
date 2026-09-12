import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { ContractForm } from '@/components/contracts/contract-form';
import { useContractsApi } from '@/lib/contracts';

export default function NewContractPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { api } = useContractsApi();

  return (
    <section className='mx-auto w-full max-w-3xl px-6 py-8'>
      <h1 className='font-heading mb-6 text-2xl font-semibold tracking-tight'>
        {t('contracts.pages.newTitle')}
      </h1>
      <ContractForm
        onSave={async (values) => {
          const created = await api.create(values);
          void navigate(`/contracts/${created.id}`);
        }}
        submitLabel={t('contracts.save')}
        cancelLabel={t('actions.cancel')}
        onCancel={() => {
          void navigate('/contracts');
        }}
      />
    </section>
  );
}
