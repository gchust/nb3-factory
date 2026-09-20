import { useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { AttachmentManager } from '@/components/attachment-manager';
import { FileViewerDialog } from '@/components/file-viewer/file-viewer-dialog';
import { useFileViewer } from '@/components/file-viewer/use-file-viewer';
import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { SelectField } from '@/components/select-field';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  clientFileRepositoryManagerToken,
  FileUploadField,
  type FileRecord,
} from '@/extensions/nocobase-file-component-ui';
import { FILE_RESOURCE_BY_KIND } from '@/lib/constants';
import {
  paymentMethodOptions,
  receivableStatusOptions,
} from '@/lib/status-labels';
import type { ReceivableRow } from '@/lib/delivery-api';
import { useDeliveryErrorMessage } from '@/lib/delivery-error';
import {
  centsToInput,
  formatDate,
  formatMoney,
  parseAmountToCents,
  todayInput,
} from '@/lib/format';
import { useDeliveryApi, useResource } from '@/lib/use-delivery-resource';

export default function ReceivablesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useDeliveryApi();
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const state = useResource(
    (client) => client.receivables({ status, page, pageSize: 10 }),
    `${status}:${page}`,
  );
  const [active, setActive] = useState<ReceivableRow>();
  const [payOpen, setPayOpen] = useState(false);
  const detail = useResource(
    (client) =>
      active ? client.receivable(active.id) : Promise.resolve(undefined),
    String(active?.id ?? ''),
  );
  const viewer = useFileViewer();
  const detailData = detail.data;

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('delivery.receivables.title')}
        description={t('delivery.receivables.description')}
      />
      <Card>
        <CardHeader className='gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <CardTitle>{t('delivery.receivables.list')}</CardTitle>
          <SelectField
            label={t('delivery.receivables.status')}
            value={status}
            onValueChange={(value) => {
              setPage(1);
              setStatus(value);
            }}
            options={[
              { value: 'all', label: t('delivery.common.allStatuses') },
              ...receivableStatusOptions(t),
            ]}
          />
        </CardHeader>
        <CardContent className='space-y-4'>
          {state.loading ? <Loading /> : null}
          {state.error ? (
            <div className='space-y-2'>
              <p className='text-sm text-destructive'>{state.error}</p>
              <Button onClick={state.reload}>
                {t('delivery.common.retry')}
              </Button>
            </div>
          ) : null}
          {state.data && !state.loading ? (
            state.data.items.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('delivery.receivables.contract')}</TableHead>
                    <TableHead>{t('delivery.receivables.milestone')}</TableHead>
                    <TableHead>{t('delivery.receivables.amount')}</TableHead>
                    <TableHead>{t('delivery.receivables.received')}</TableHead>
                    <TableHead>
                      {t('delivery.receivables.outstanding')}
                    </TableHead>
                    <TableHead>{t('delivery.receivables.status')}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.data.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link
                          className='text-sm font-medium text-primary underline-offset-4 hover:underline'
                          to={`/contracts/${row.contractId}`}
                        >
                          {row.contractNo}
                        </Link>
                      </TableCell>
                      <TableCell>{row.milestoneName}</TableCell>
                      <TableCell>{formatMoney(row.amountCents)}</TableCell>
                      <TableCell>{formatMoney(row.receivedCents)}</TableCell>
                      <TableCell>{formatMoney(row.outstandingCents)}</TableCell>
                      <TableCell className='space-x-1'>
                        <StatusBadge kind='receivable' status={row.status} />
                      </TableCell>
                      <TableCell>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => {
                            setActive(row);
                            setPayOpen(false);
                          }}
                        >
                          {t('delivery.common.detail')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t('delivery.receivables.empty')}
              </p>
            )
          ) : null}
          <div className='flex items-center justify-between'>
            <span className='text-sm text-muted-foreground'>
              {t('delivery.common.page', { page })}
            </span>
            <div className='flex gap-2'>
              <Button
                size='sm'
                variant='outline'
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                {t('delivery.common.previous')}
              </Button>
              <Button
                size='sm'
                variant='outline'
                disabled={!state.data?.hasMore}
                onClick={() => setPage((value) => value + 1)}
              >
                {t('delivery.common.next')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(active)}
        onOpenChange={(open) => {
          if (!open) setActive(undefined);
        }}
      >
        <DialogContent className='max-w-3xl'>
          <DialogHeader>
            <DialogTitle>
              {t('delivery.receivables.detail')} · {active?.contractNo}
            </DialogTitle>
            <DialogDescription>
              {active?.milestoneName} · {t('delivery.receivables.due')}:{' '}
              {formatDate(active?.milestoneDueDate)}
            </DialogDescription>
          </DialogHeader>
          {detail.loading ? <Loading /> : null}
          {detail.error ? (
            <p className='text-sm text-destructive'>{detail.error}</p>
          ) : null}
          {detailData ? (
            <div className='space-y-4'>
              <div className='grid gap-2 sm:grid-cols-3'>
                <Summary
                  label={t('delivery.receivables.amount')}
                  value={formatMoney(detailData.receivable.amountCents)}
                />
                <Summary
                  label={t('delivery.receivables.received')}
                  value={formatMoney(detailData.receivable.receivedCents)}
                />
                <Summary
                  label={t('delivery.receivables.outstanding')}
                  value={formatMoney(detailData.receivable.outstandingCents)}
                />
              </div>
              <div className='space-y-2'>
                <div className='flex items-center justify-between'>
                  <p className='font-medium'>
                    {t('delivery.receivables.payments')}
                  </p>
                  <Button
                    size='sm'
                    disabled={
                      !detailData.canManageMoney ||
                      detailData.receivable.outstandingCents <= 0
                    }
                    onClick={() => setPayOpen(true)}
                  >
                    <Plus aria-hidden='true' />{' '}
                    {t('delivery.receivables.registerPayment')}
                  </Button>
                </div>
                {detailData.payments.length ? (
                  detailData.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className='space-y-2 rounded-md border border-border p-3 text-sm'
                    >
                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='font-medium'>
                          {formatMoney(payment.amountCents)}
                        </span>
                        <span className='text-muted-foreground'>
                          {formatDate(payment.receivedAt)} · {payment.method} ·{' '}
                          {payment.createdByName}
                        </span>
                      </div>
                      {payment.note ? (
                        <p className='text-muted-foreground'>{payment.note}</p>
                      ) : null}
                      <AttachmentManager
                        resource={FILE_RESOURCE_BY_KIND.payment}
                        files={payment.files}
                        canManage={detailData.canManageMoney}
                        onAdd={(fileIds) =>
                          api
                            .linkPaymentFiles(payment.id, fileIds)
                            .then(detail.reload)
                        }
                        onRename={(fileId, filename) =>
                          api
                            .renameFile('payment', fileId, filename)
                            .then(detail.reload)
                        }
                        onRemove={(fileId) =>
                          api.removeFile('payment', fileId).then(detail.reload)
                        }
                        onPreview={(files, index) => viewer.show(files, index)}
                      />
                    </div>
                  ))
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    {t('delivery.receivables.noPayments')}
                  </p>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant='outline' onClick={() => setActive(undefined)}>
              {t('actions.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentDialog
        receivable={detail.data?.receivable}
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onDone={() => {
          setPayOpen(false);
          detail.reload();
          state.reload();
        }}
      />

      <FileViewerDialog
        files={viewer.files}
        initialIndex={viewer.index}
        open={viewer.open}
        onOpenChange={(open) => (open ? undefined : viewer.hide())}
      />
    </PageContainer>
  );
}

function Summary({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='rounded-md border border-border p-3'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='font-medium'>{value}</p>
    </div>
  );
}

function PaymentDialog({
  receivable,
  open,
  onClose,
  onDone,
}: {
  readonly receivable: ReceivableRow | undefined;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onDone: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const errorMessage = useDeliveryErrorMessage();
  const api = useDeliveryApi();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository(FILE_RESOURCE_BY_KIND.payment),
    [manager],
  );
  const [amount, setAmount] = useState('');
  const [receivedAt, setReceivedAt] = useState(() => todayInput());
  const [method, setMethod] = useState('transfer');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<readonly FileRecord[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (!receivable) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.registerPayment(receivable.id, {
        amountCents: parseAmountToCents(amount),
        receivedAt,
        method,
        note,
        fileIds: selected.map((file) => file.id),
      });
      setAmount('');
      setNote('');
      setSelected([]);
      onDone();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('delivery.receivables.registerPayment')}</DialogTitle>
          <DialogDescription>
            {t('delivery.receivables.paymentHint', {
              outstanding: formatMoney(receivable?.outstandingCents ?? 0),
            })}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='space-y-2'>
            <Label htmlFor='payment-amount'>
              {t('delivery.receivables.amount')}
            </Label>
            <Input
              id='payment-amount'
              inputMode='decimal'
              placeholder={centsToInput(receivable?.outstandingCents ?? 0)}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='payment-date'>
              {t('delivery.receivables.receivedAt')}
            </Label>
            <Input
              id='payment-date'
              type='date'
              value={receivedAt}
              onChange={(event) => setReceivedAt(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label>{t('delivery.receivables.method')}</Label>
            <SelectField
              label={t('delivery.receivables.method')}
              className='w-full min-w-0'
              value={method}
              onValueChange={setMethod}
              options={paymentMethodOptions(t)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='payment-note'>
              {t('delivery.receivables.note')}
            </Label>
            <Input
              id='payment-note'
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label>{t('delivery.receivables.receipts')}</Label>
            <FileUploadField
              repository={repository}
              value={selected}
              onChange={setSelected}
              onError={(cause) => setError(cause.message)}
              multiple
              maxSize={20 * 1024 * 1024}
              maxFiles={5}
            />
          </div>
          {error ? (
            <p className='text-sm text-destructive' role='alert'>
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button disabled={busy || !amount} onClick={() => void submit()}>
            {t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
