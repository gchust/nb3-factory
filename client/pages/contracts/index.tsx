import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

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
  formatDate,
  formatMoney,
  parseAmountToCents,
  todayInput,
} from '@/lib/format';
import { useDeliveryErrorMessage } from '@/lib/delivery-error';
import { contractStatusOptions } from '@/lib/status-labels';
import { useDeliveryApi, useResource } from '@/lib/use-delivery-resource';

interface ContractForm {
  contractNo: string;
  title: string;
  customerId: string;
  amount: string;
  currency: string;
  startDate: string;
  endDate: string;
  note: string;
}

const EMPTY_FORM: ContractForm = {
  contractNo: '',
  title: '',
  customerId: '',
  amount: '0.00',
  currency: 'CNY',
  startDate: todayInput(),
  endDate: todayInput(),
  note: '',
};

export default function ContractsPage(): ReactElement {
  const { t } = useTranslation();
  const errorMessage = useDeliveryErrorMessage();
  const api = useDeliveryApi();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const state = useResource(
    (client) => client.contracts({ search, status, page, pageSize: 10 }),
    `${search}:${status}:${page}`,
  );
  const customers = useResource((client) =>
    client.customers({ pageSize: 100 }),
  );
  const [form, setForm] = useState<ContractForm>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (!form) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.createContract({
        contractNo: form.contractNo,
        title: form.title,
        customerId: Number(form.customerId),
        amountCents: parseAmountToCents(form.amount),
        currency: form.currency,
        startDate: form.startDate,
        endDate: form.endDate,
        note: form.note,
      });
      setForm(undefined);
      state.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const customerOptions = [
    { value: '', label: t('delivery.contracts.selectCustomer') },
    ...(customers.data?.items ?? []).map((customer) => ({
      value: String(customer.id),
      label: `${customer.code} ${customer.name}`,
    })),
  ];

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('delivery.contracts.title')}
        description={t('delivery.contracts.description')}
        actions={
          <Button onClick={() => setForm({ ...EMPTY_FORM })}>
            <Plus aria-hidden='true' /> {t('delivery.contracts.create')}
          </Button>
        }
      />
      <Card>
        <CardHeader className='gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <CardTitle>{t('delivery.contracts.list')}</CardTitle>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              aria-label={t('delivery.common.search')}
              className='sm:max-w-xs'
              placeholder={t('delivery.contracts.searchPlaceholder')}
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
            />
            <SelectField
              label={t('delivery.contracts.status')}
              value={status}
              onValueChange={(value) => {
                setPage(1);
                setStatus(value);
              }}
              options={[
                { value: 'all', label: t('delivery.common.allStatuses') },
                ...contractStatusOptions(t),
              ]}
            />
          </div>
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
                    <TableHead>{t('delivery.contracts.contractNo')}</TableHead>
                    <TableHead>{t('delivery.contracts.name')}</TableHead>
                    <TableHead>{t('delivery.contracts.customer')}</TableHead>
                    <TableHead>{t('delivery.contracts.amount')}</TableHead>
                    <TableHead>{t('delivery.contracts.status')}</TableHead>
                    <TableHead>{t('delivery.contracts.progress')}</TableHead>
                    <TableHead>{t('delivery.contracts.endDate')}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.data.items.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell className='font-medium'>
                        {contract.contractNo}
                      </TableCell>
                      <TableCell>{contract.title}</TableCell>
                      <TableCell>{contract.customerName}</TableCell>
                      <TableCell>
                        {formatMoney(contract.amountCents, contract.currency)}
                      </TableCell>
                      <TableCell className='space-x-1'>
                        <StatusBadge kind='contract' status={contract.status} />
                        {contract.isOverdue ? (
                          <StatusBadge kind='receivable' status='unpaid' />
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {t('delivery.dashboard.progressHint', {
                          accepted: contract.acceptedMilestoneCount,
                          total: contract.milestoneCount,
                        })}
                      </TableCell>
                      <TableCell>{formatDate(contract.endDate)}</TableCell>
                      <TableCell>
                        <Link
                          className='text-sm font-medium text-primary underline-offset-4 hover:underline'
                          to={`/contracts/${contract.id}`}
                        >
                          {t('delivery.common.detail')}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t('delivery.contracts.empty')}
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
        open={Boolean(form)}
        onOpenChange={(open) => (open ? undefined : setForm(undefined))}
      >
        <DialogContent className='max-w-2xl'>
          <DialogHeader>
            <DialogTitle>{t('delivery.contracts.create')}</DialogTitle>
            <DialogDescription>
              {t('delivery.contracts.formHint')}
            </DialogDescription>
          </DialogHeader>
          {form ? (
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='contract-no'>
                  {t('delivery.contracts.contractNo')}
                </Label>
                <Input
                  id='contract-no'
                  value={form.contractNo}
                  onChange={(event) =>
                    setForm({ ...form, contractNo: event.target.value })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='contract-title'>
                  {t('delivery.contracts.name')}
                </Label>
                <Input
                  id='contract-title'
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='contract-customer'>
                  {t('delivery.contracts.customer')}
                </Label>
                <SelectField
                  label={t('delivery.contracts.customer')}
                  className='w-full min-w-0'
                  value={form.customerId}
                  onValueChange={(value) =>
                    setForm({ ...form, customerId: value })
                  }
                  options={customerOptions}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='contract-amount'>
                  {t('delivery.contracts.amount')}
                </Label>
                <Input
                  id='contract-amount'
                  inputMode='decimal'
                  value={form.amount}
                  onChange={(event) =>
                    setForm({ ...form, amount: event.target.value })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='contract-currency'>
                  {t('delivery.contracts.currency')}
                </Label>
                <Input
                  id='contract-currency'
                  value={form.currency}
                  onChange={(event) =>
                    setForm({ ...form, currency: event.target.value })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='contract-start'>
                  {t('delivery.contracts.startDate')}
                </Label>
                <Input
                  id='contract-start'
                  type='date'
                  value={form.startDate}
                  onChange={(event) =>
                    setForm({ ...form, startDate: event.target.value })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='contract-end'>
                  {t('delivery.contracts.endDate')}
                </Label>
                <Input
                  id='contract-end'
                  type='date'
                  value={form.endDate}
                  onChange={(event) =>
                    setForm({ ...form, endDate: event.target.value })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='contract-note'>
                  {t('delivery.contracts.note')}
                </Label>
                <Input
                  id='contract-note'
                  value={form.note}
                  onChange={(event) =>
                    setForm({ ...form, note: event.target.value })
                  }
                />
              </div>
              {error ? (
                <p
                  className='text-sm text-destructive sm:col-span-2'
                  role='alert'
                >
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant='outline' onClick={() => setForm(undefined)}>
              {t('actions.cancel')}
            </Button>
            <Button disabled={busy} onClick={() => void submit()}>
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
