import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { FileList } from '@/extensions/nocobase-file-component-ui/components/file-list';
import type { FileRecord } from '@/extensions/nocobase-file-component-ui/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/contracts/status-badge';
import { fileUiLabels } from '@/components/contracts/file-labels';
import {
  contractErrorMessage,
  formatContractAmount,
  useContractsApi,
  type ContractRecord,
} from '@/lib/contracts';

export default function ContractDetailPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const contractId = Number(params.id);
  const { api } = useContractsApi();
  const labels = fileUiLabels(t);

  const [contract, setContract] = useState<ContractRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removingAttachment, setRemovingAttachment] =
    useState<FileRecord | null>(null);
  const [removePending, setRemovePending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

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

  const reload = useCallback(async (): Promise<void> => {
    try {
      const loaded = await api.get(contractId);
      setContract(loaded);
      setError(null);
    } catch (loadError) {
      setError(contractErrorMessage(loadError, t));
    }
  }, [api, contractId, t, setContract, setError]);

  const confirmRemoveAttachment = async (): Promise<void> => {
    if (!removingAttachment) return;
    setRemovePending(true);
    try {
      await api.deleteAttachment(contractId, removingAttachment.id);
      setRemovingAttachment(null);
      await reload();
    } catch (removeError) {
      setError(contractErrorMessage(removeError, t));
    } finally {
      setRemovePending(false);
    }
  };

  const confirmDelete = async (): Promise<void> => {
    setDeletePending(true);
    try {
      await api.remove(contractId);
      void navigate('/contracts');
    } catch (deleteError) {
      setError(contractErrorMessage(deleteError, t));
      setDeletePending(false);
    }
  };

  return (
    <section className='mx-auto w-full max-w-5xl px-6 py-8'>
      <Button
        variant='ghost'
        size='sm'
        className='mb-4 -ml-2'
        onClick={() => {
          void navigate('/contracts');
        }}
      >
        <ArrowLeft aria-hidden='true' />
        {t('contracts.backToList')}
      </Button>

      {error && contract === null ? (
        <div
          role='alert'
          className='rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
        >
          {error}
        </div>
      ) : null}

      {contract === null && !error ? (
        <div className='flex items-center justify-center py-16 text-muted-foreground'>
          <Spinner className='size-5' />
        </div>
      ) : contract ? (
        <>
          <div className='mb-6 flex flex-wrap items-start justify-between gap-3'>
            <div className='min-w-0'>
              <div className='flex flex-wrap items-center gap-3'>
                <h1 className='font-heading text-2xl font-semibold tracking-tight'>
                  {contract.name}
                </h1>
                <StatusBadge status={contract.status} />
              </div>
              <p className='mt-1 font-mono text-sm text-muted-foreground'>
                {contract.contractNo}
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                onClick={() => {
                  void navigate(`/contracts/${contract.id}/edit`);
                }}
              >
                <Pencil aria-hidden='true' />
                {t('contracts.edit')}
              </Button>
              <Button variant='destructive' onClick={() => setDeleting(true)}>
                <Trash2 aria-hidden='true' />
                {t('contracts.delete')}
              </Button>
            </div>
          </div>

          {error ? (
            <div
              role='alert'
              className='mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
            >
              {error}
            </div>
          ) : null}

          <div className='space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>{t('contracts.sections.basic')}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className='grid gap-x-6 gap-y-3 sm:grid-cols-2'>
                  <Detail label={t('contracts.fields.contractNo')}>
                    <span className='font-mono'>{contract.contractNo}</span>
                  </Detail>
                  <Detail label={t('contracts.fields.party')}>
                    {contract.party}
                  </Detail>
                  <Detail label={t('contracts.fields.signedAt')}>
                    {contract.signedAt ?? '—'}
                  </Detail>
                  <Detail label={t('contracts.fields.amount')}>
                    {contract.amount === null
                      ? '—'
                      : formatContractAmount(contract.amount)}
                  </Detail>
                  <Detail label={t('contracts.fields.status')}>
                    <StatusBadge status={contract.status} />
                  </Detail>
                  <Detail label={t('contracts.fields.remark')}>
                    {contract.remark ?? '—'}
                  </Detail>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('contracts.sections.body')}</CardTitle>
              </CardHeader>
              <CardContent>
                {contract.body ? (
                  <FileList
                    files={[contract.body]}
                    labels={labels}
                    onError={(fileError) => setError(fileError.message)}
                  />
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    {t('contracts.files.bodyEmpty')}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('contracts.sections.attachments')}</CardTitle>
              </CardHeader>
              <CardContent>
                <FileList
                  files={contract.attachments}
                  labels={labels}
                  onError={(fileError) => setError(fileError.message)}
                  onRemove={(file) => setRemovingAttachment(file)}
                  emptyState={
                    <p className='text-sm text-muted-foreground'>
                      {t('contracts.files.attachmentsEmpty')}
                    </p>
                  }
                />
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      <Dialog
        open={removingAttachment !== null}
        onOpenChange={(open) => {
          if (!open) setRemovingAttachment(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{t('contracts.attachmentDeleteTitle')}</DialogTitle>
          <DialogDescription>
            {removingAttachment !== null
              ? t('contracts.attachmentDeleteBody', {
                  name: removingAttachment.filename,
                })
              : ''}
          </DialogDescription>
          <div className='mt-2 flex justify-end gap-2'>
            <Button
              variant='outline'
              onClick={() => setRemovingAttachment(null)}
              disabled={removePending}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              variant='destructive'
              onClick={() => void confirmRemoveAttachment()}
              disabled={removePending}
            >
              {removePending ? t('contracts.deleting') : t('contracts.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(false);
        }}
      >
        <DialogContent>
          <DialogTitle>{t('contracts.deleteTitle')}</DialogTitle>
          <DialogDescription>
            {contract ? t('contracts.deleteBody', { name: contract.name }) : ''}
          </DialogDescription>
          <div className='mt-2 flex justify-end gap-2'>
            <Button
              variant='outline'
              onClick={() => setDeleting(false)}
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

function Detail({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div>
      <dt className='text-sm text-muted-foreground'>{label}</dt>
      <dd className='mt-0.5 text-sm'>{children}</dd>
    </div>
  );
}
