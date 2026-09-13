import { Download, Eye, FileText, Pencil, Plus } from 'lucide-react';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { ContractForm } from '@/components/contracts/contract-form';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  ALL_CATEGORIES,
  CONTRACT_CATEGORIES,
  contractErrorMessage,
  downloadUrl,
  useContractsApi,
  type ContractCategoryFilter,
  type ContractRecord,
} from '@/lib/contracts';

export default function ContractsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useContractsApi();

  const [category, setCategory] =
    useState<ContractCategoryFilter>(ALL_CATEGORIES);
  const [contracts, setContracts] = useState<readonly ContractRecord[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContractRecord | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.list(category);
        if (cancelled) return;
        setContracts(data);
        setError(null);
      } catch (cause) {
        if (!cancelled) setError(contractErrorMessage(cause, t));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, category, version, t]);

  const closeForm = (): void => {
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <section className='mx-auto w-full max-w-5xl px-6 py-8'>
      <div className='mb-6 flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {t('contracts.title')}
          </h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            {t('contracts.description')}
          </p>
        </div>
        <div className='flex items-center gap-3'>
          <div className='space-y-1'>
            <span className='block text-xs font-medium text-muted-foreground'>
              {t('contracts.filter.label')}
            </span>
            <Select
              value={category}
              onValueChange={(value) => {
                if (value) setCategory(value);
              }}
            >
              <SelectTrigger aria-label={t('contracts.filter.label')}>
                <SelectValue placeholder={t('contracts.filter.label')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES}>
                  {t('contracts.filter.all')}
                </SelectItem>
                {CONTRACT_CATEGORIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(`contracts.categories.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus aria-hidden='true' />
            {t('contracts.newContract')}
          </Button>
        </div>
      </div>

      {formOpen ? (
        <div className='mb-6 rounded-lg border border-border bg-card p-5'>
          <ContractForm
            key={editing ? `edit-${editing.id}` : 'new'}
            initial={editing}
            onSaved={() => {
              closeForm();
              setVersion((current) => current + 1);
            }}
            onCancel={closeForm}
          />
        </div>
      ) : null}

      {error ? (
        <div
          role='alert'
          className='mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
        >
          {error}
        </div>
      ) : null}

      {contracts === null ? (
        <div className='flex items-center justify-center py-16 text-muted-foreground'>
          <Spinner className='size-5' />
        </div>
      ) : contracts.length === 0 ? (
        <div className='rounded-md border border-dashed py-16 text-center text-sm text-muted-foreground'>
          {t('contracts.empty')}
        </div>
      ) : (
        <div className='overflow-x-auto rounded-md border'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50'>
              <tr>
                <th className='px-3 py-2 text-left text-xs font-medium text-muted-foreground'>
                  {t('contracts.fields.name')}
                </th>
                <th className='px-3 py-2 text-left text-xs font-medium text-muted-foreground'>
                  {t('contracts.fields.counterparty')}
                </th>
                <th className='px-3 py-2 text-left text-xs font-medium text-muted-foreground'>
                  {t('contracts.fields.category')}
                </th>
                <th className='px-3 py-2 text-left text-xs font-medium text-muted-foreground'>
                  {t('contracts.fields.attachment')}
                </th>
                <th className='px-3 py-2 text-right text-xs font-medium text-muted-foreground'>
                  {t('contracts.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => (
                <tr key={contract.id} className='border-t border-border'>
                  <td
                    className='max-w-56 truncate px-3 py-2'
                    title={contract.name}
                  >
                    {contract.name}
                  </td>
                  <td
                    className='max-w-48 truncate px-3 py-2'
                    title={contract.counterparty}
                  >
                    {contract.counterparty}
                  </td>
                  <td className='px-3 py-2'>
                    <span className='inline-flex rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground'>
                      {t(`contracts.categories.${contract.category}`)}
                    </span>
                  </td>
                  <td className='px-3 py-2'>
                    {contract.attachment ? (
                      <div className='flex items-center gap-3'>
                        <a
                          className='inline-flex min-w-0 items-center gap-1.5 text-primary underline-offset-4 hover:underline'
                          href={downloadUrl(contract.attachment.contentUrl)}
                          download={contract.attachment.filename}
                          title={t('contracts.attachment.download')}
                        >
                          <FileText
                            aria-hidden='true'
                            className='size-3.5 shrink-0'
                          />
                          <span className='max-w-44 truncate font-mono text-xs'>
                            {contract.attachment.filename}
                          </span>
                          <Download
                            aria-hidden='true'
                            className='size-3.5 shrink-0'
                          />
                        </a>
                        <a
                          className='text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline'
                          href={contract.attachment.contentUrl}
                          target='_blank'
                          rel='noreferrer'
                          title={t('contracts.attachment.view')}
                        >
                          <Eye aria-hidden='true' className='size-3.5' />
                        </a>
                      </div>
                    ) : (
                      <span className='text-muted-foreground'>
                        {t('contracts.attachment.none')}
                      </span>
                    )}
                  </td>
                  <td className='px-3 py-2 text-right'>
                    <Button
                      size='icon-sm'
                      variant='ghost'
                      aria-label={`${t('contracts.edit')}: ${contract.name}`}
                      title={t('contracts.edit')}
                      onClick={() => {
                        setEditing(contract);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil aria-hidden='true' />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
