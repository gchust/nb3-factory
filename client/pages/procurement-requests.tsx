import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import {
  EmptyLine,
  ErrorLine,
  LoadingLine,
  ProcurementCard,
  ProcurementPage,
} from '@/components/procurement/page-shell';
import { StatusBadge } from '@/components/procurement/status-badge';
import { Button } from '@/components/ui/button';
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
  formatMoney,
  messageOf,
  useLoaded,
  useProcurementApi,
  type RequestItemInput,
} from '@/lib/procurement-api';

interface DraftItem extends RequestItemInput {
  readonly key: number;
}

let itemKey = 2;

function emptyItem(): DraftItem {
  return {
    key: (itemKey += 1),
    materialName: '',
    specification: '',
    quantity: 1,
    unitPrice: 0,
  };
}

function lineAmount(item: DraftItem): number {
  const quantity = Number(item.quantity);
  const unitPrice = Number(item.unitPrice);
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return 0;
  return Math.round(quantity * unitPrice * 100) / 100;
}

export default function RequestsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useProcurementApi();
  const [department, setDepartment] = useState('');
  const [description, setDescription] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [items, setItems] = useState<DraftItem[]>(() => [
    { ...emptyItem(), key: 0 },
    { ...emptyItem(), key: 1 },
  ]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const requestsLoader = useCallback(() => api.listRequests(), [api]);
  const {
    data: requests,
    loading,
    error: loadError,
    reload,
  } = useLoaded(requestsLoader);
  const meLoader = useCallback(() => api.me(), [api]);
  const { data: me } = useLoaded(meLoader);

  const total = items.reduce((sum, item) => sum + lineAmount(item), 0);

  const submit = async (event: { preventDefault(): void }): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await api.createRequest({
        department,
        description,
        expectedDate,
        items: items.map((item) => ({
          materialName: item.materialName,
          specification: item.specification,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
      });
      setDepartment('');
      setDescription('');
      setExpectedDate('');
      setItems([
        { ...emptyItem(), key: 0 },
        { ...emptyItem(), key: 1 },
      ]);
      setMessage(t('procurement.requests.created'));
      reload();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  };

  const submitForApproval = async (id: number): Promise<void> => {
    setError(undefined);
    try {
      await api.submitRequest(id);
      setMessage(t('procurement.requests.submitted'));
      reload();
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const updateItem = (key: number, patch: Partial<DraftItem>): void => {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  };

  return (
    <ProcurementPage title={t('procurement.requests.title')}>
      {me && !me.capabilities.viewAllRequests ? (
        <p className='text-sm text-muted-foreground'>
          {t('procurement.requests.ownOnly')}
        </p>
      ) : null}

      <ProcurementCard title={t('procurement.requests.createTitle')}>
        <form className='space-y-4' onSubmit={(event) => void submit(event)}>
          <div className='grid gap-4 md:grid-cols-3'>
            <div className='space-y-2'>
              <Label htmlFor='request-department'>
                {t('procurement.requests.department')}
              </Label>
              <Input
                id='request-department'
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='request-date'>
                {t('procurement.requests.expectedDate')}
              </Label>
              <Input
                id='request-date'
                type='date'
                value={expectedDate}
                onChange={(event) => setExpectedDate(event.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='request-description'>
                {t('procurement.requests.description')}
              </Label>
              <Input
                id='request-description'
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>

          <div className='space-y-2'>
            <p className='text-sm font-medium'>
              {t('procurement.requests.items')}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t('procurement.requests.materialName')}
                  </TableHead>
                  <TableHead>
                    {t('procurement.requests.specification')}
                  </TableHead>
                  <TableHead className='w-28'>
                    {t('procurement.requests.quantity')}
                  </TableHead>
                  <TableHead className='w-32'>
                    {t('procurement.requests.unitPrice')}
                  </TableHead>
                  <TableHead className='w-32'>
                    {t('procurement.requests.amount')}
                  </TableHead>
                  <TableHead className='w-20'>
                    {t('procurement.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={item.key}>
                    <TableCell>
                      <Input
                        aria-label={`${t('procurement.requests.materialName')} ${index + 1}`}
                        value={item.materialName}
                        onChange={(event) =>
                          updateItem(item.key, {
                            materialName: event.target.value,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`${t('procurement.requests.specification')} ${index + 1}`}
                        value={item.specification}
                        onChange={(event) =>
                          updateItem(item.key, {
                            specification: event.target.value,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`${t('procurement.requests.quantity')} ${index + 1}`}
                        type='number'
                        min='0'
                        step='1'
                        value={item.quantity}
                        onChange={(event) =>
                          updateItem(item.key, {
                            quantity: Number(event.target.value),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`${t('procurement.requests.unitPrice')} ${index + 1}`}
                        type='number'
                        min='0'
                        step='0.01'
                        value={item.unitPrice}
                        onChange={(event) =>
                          updateItem(item.key, {
                            unitPrice: Number(event.target.value),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className='tabular-nums'>
                      {formatMoney(lineAmount(item))}
                    </TableCell>
                    <TableCell>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        disabled={items.length <= 1}
                        onClick={() =>
                          setItems((current) =>
                            current.filter((entry) => entry.key !== item.key),
                          )
                        }
                      >
                        {t('procurement.requests.removeItem')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className='flex items-center justify-between'>
              <Button
                type='button'
                variant='outline'
                onClick={() => setItems((c) => [...c, emptyItem()])}
              >
                {t('procurement.requests.addItem')}
              </Button>
              <p className='text-sm font-medium'>
                {t('procurement.requests.total')}:{' '}
                <span className='tabular-nums'>{formatMoney(total)}</span>
              </p>
            </div>
          </div>

          <Button type='submit' disabled={saving}>
            {saving ? t('procurement.saving') : t('procurement.save')}
          </Button>
          {message ? (
            <p className='text-sm text-muted-foreground'>{message}</p>
          ) : null}
          {error ? <ErrorLine message={error} /> : null}
        </form>
      </ProcurementCard>

      <ProcurementCard title={t('procurement.requests.title')}>
        {loading ? <LoadingLine /> : null}
        {loadError ? <ErrorLine message={loadError} /> : null}
        {requests && requests.length === 0 ? <EmptyLine /> : null}
        {requests && requests.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{t('procurement.requests.applicant')}</TableHead>
                <TableHead>{t('procurement.requests.department')}</TableHead>
                <TableHead>{t('procurement.requests.total')}</TableHead>
                <TableHead>{t('procurement.requestStatus.label')}</TableHead>
                <TableHead>{t('procurement.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>{request.id}</TableCell>
                  <TableCell>
                    {request.applicantName ?? request.applicantId}
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {request.department ?? '—'}
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {formatMoney(request.totalAmount)}
                  </TableCell>
                  <TableCell>
                    <div className='space-y-1'>
                      <StatusBadge kind='request' status={request.status} />
                      {request.status === 'rejected' && request.rejectReason ? (
                        <p className='text-xs text-destructive'>
                          {request.rejectReason}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className='space-x-2 whitespace-nowrap'>
                    <Button
                      variant='ghost'
                      size='sm'
                      render={
                        <Link to={`/procurement/requests/${request.id}`} />
                      }
                    >
                      {t('procurement.requests.viewDetail')}
                    </Button>
                    {request.status === 'draft' ? (
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => void submitForApproval(request.id)}
                      >
                        {t('procurement.requests.submit')}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </ProcurementCard>
    </ProcurementPage>
  );
}
