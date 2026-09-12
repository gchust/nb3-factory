import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Pencil, Trash2, Eye } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/contracts/status-badge';
import {
  contractErrorMessage,
  formatContractAmount,
  useContractsApi,
  type ContractRecord,
} from '@/lib/contracts';

export default function ContractsIndexPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { api } = useContractsApi();

  const [contracts, setContracts] = useState<readonly ContractRecord[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ContractRecord | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.list();
        if (cancelled) return;
        setContracts(data);
        setError(null);
      } catch (loadError) {
        if (!cancelled) setError(contractErrorMessage(loadError, t));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, t, setContracts, setError]);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const data = await api.list();
      setContracts(data);
      setError(null);
    } catch (loadError) {
      setError(contractErrorMessage(loadError, t));
    }
  }, [api, t]);

  const confirmDelete = async (): Promise<void> => {
    if (!deleting) return;
    setDeletePending(true);
    try {
      await api.remove(deleting.id);
      setDeleting(null);
      await reload();
    } catch (deleteError) {
      setError(contractErrorMessage(deleteError, t));
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <section className='mx-auto w-full max-w-5xl px-6 py-8'>
      <div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {t('contracts.title')}
          </h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            {t('contracts.description')}
          </p>
        </div>
        <Button
          onClick={() => {
            void navigate('/contracts/new');
          }}
        >
          <Plus aria-hidden='true' />
          {t('contracts.newContract')}
        </Button>
      </div>

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('contracts.fields.contractNo')}</TableHead>
                <TableHead>{t('contracts.fields.name')}</TableHead>
                <TableHead>{t('contracts.fields.party')}</TableHead>
                <TableHead>{t('contracts.fields.signedAt')}</TableHead>
                <TableHead className='text-right'>
                  {t('contracts.fields.amount')}
                </TableHead>
                <TableHead>{t('contracts.fields.status')}</TableHead>
                <TableHead className='text-right'>
                  {t('contracts.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell className='font-mono text-sm'>
                    {contract.contractNo}
                  </TableCell>
                  <TableCell
                    className='max-w-48 truncate'
                    title={contract.name}
                  >
                    {contract.name}
                  </TableCell>
                  <TableCell
                    className='max-w-40 truncate'
                    title={contract.party}
                  >
                    {contract.party}
                  </TableCell>
                  <TableCell className='whitespace-nowrap'>
                    {contract.signedAt ?? '—'}
                  </TableCell>
                  <TableCell className='text-right whitespace-nowrap'>
                    {contract.amount === null
                      ? '—'
                      : formatContractAmount(contract.amount)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={contract.status} />
                  </TableCell>
                  <TableCell>
                    <div className='flex items-center justify-end gap-1'>
                      <Button
                        size='icon'
                        variant='ghost'
                        aria-label={`${t('contracts.view')}: ${contract.contractNo}`}
                        title={t('contracts.view')}
                        onClick={() => {
                          void navigate(`/contracts/${contract.id}`);
                        }}
                      >
                        <Eye aria-hidden='true' />
                      </Button>
                      <Button
                        size='icon'
                        variant='ghost'
                        aria-label={`${t('contracts.edit')}: ${contract.contractNo}`}
                        title={t('contracts.edit')}
                        onClick={() => {
                          void navigate(`/contracts/${contract.id}/edit`);
                        }}
                      >
                        <Pencil aria-hidden='true' />
                      </Button>
                      <Button
                        size='icon'
                        variant='ghost'
                        aria-label={`${t('contracts.delete')}: ${contract.contractNo}`}
                        title={t('contracts.delete')}
                        onClick={() => setDeleting(contract)}
                      >
                        <Trash2 aria-hidden='true' />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{t('contracts.deleteTitle')}</DialogTitle>
          <DialogDescription>
            {deleting ? t('contracts.deleteBody', { name: deleting.name }) : ''}
          </DialogDescription>
          <div className='mt-2 flex justify-end gap-2'>
            <Button
              variant='outline'
              onClick={() => setDeleting(null)}
              disabled={deletePending}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              variant='destructive'
              onClick={() => void confirmDelete()}
              disabled={deletePending}
            >
              {deletePending ? t('contracts.deleting') : t('contracts.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
