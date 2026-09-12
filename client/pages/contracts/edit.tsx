import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';

import { ContractForm } from '@/components/contracts/contract-form';
import { Spinner } from '@/components/ui/spinner';
import {
  contractErrorMessage,
  useContractsApi,
  type ContractRecord,
} from '@/lib/contracts';

export default function EditContractPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const contractId = Number(params.id);
  const { api } = useContractsApi();

  const [contract, setContract] = useState<ContractRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await api.get(contractId);
        if (!cancelled) setContract(loaded);
        if (!cancelled) setError(null);
      } catch (loadError) {
        if (!cancelled) setError(contractErrorMessage(loadError, t));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, contractId, t, setContract, setError]);

  return (
    <section className='mx-auto w-full max-w-3xl px-6 py-8'>
      <h1 className='font-heading mb-6 text-2xl font-semibold tracking-tight'>
        {t('contracts.pages.editTitle')}
      </h1>
      {error ? (
        <div
          role='alert'
          className='rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
        >
          {error}
        </div>
      ) : contract === null ? (
        <div className='flex items-center justify-center py-16 text-muted-foreground'>
          <Spinner className='size-5' />
        </div>
      ) : (
        <ContractForm
          initial={contract}
          onSave={async (values) => {
            const updated = await api.update(contractId, values);
            void navigate(`/contracts/${updated.id}`);
          }}
          submitLabel={t('contracts.save')}
          cancelLabel={t('actions.cancel')}
          onCancel={() => {
            void navigate(`/contracts/${contractId}`);
          }}
        />
      )}
    </section>
  );
}
