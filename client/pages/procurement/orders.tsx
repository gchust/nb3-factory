import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AttachmentPanel } from '@/components/procurement/attachment-panel.js';
import {
  approveOrder,
  createOrder,
  errorCode,
  getOrder,
  getPrincipal,
  listMaterials,
  listOrders,
  listSuppliers,
  rejectOrder,
  submitOrder,
  updateOrder,
  type Material,
  type Order,
  type OrderInput,
  type Principal,
  type Supplier,
} from '@/components/procurement/api.js';
import {
  formatAmount,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatQuantity,
} from '@/components/procurement/format.js';
import {
  EmptyState,
  ErrorBanner,
  Field,
  OrderStatusBadge,
  ReceiptStatusBadge,
  Table,
  TD,
  TH,
  THead,
  TR,
} from '@/components/procurement/ui.js';
import { useAsyncData } from '@/components/procurement/use-async-data.js';

const STATUS_OPTIONS = [
  '',
  'draft',
  'submitted',
  'approved',
  'rejected',
] as const;

export default function ProcurementOrdersPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useAsyncData(
    () =>
      Promise.all([
        listOrders(api, status ? { status } : {}),
        listSuppliers(api),
        listMaterials(api),
        getPrincipal(api),
      ]),
    [api, status],
  );
  const orders = data?.[0] ?? [];
  const suppliers = data?.[1] ?? [];
  const materials = data?.[2] ?? [];
  const principal = data?.[3];
  const [editorOrder, setEditorOrder] = useState<Order | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);

  const canCreate =
    principal !== undefined &&
    (principal.isAdministrator ||
      principal.roles.includes('manager') ||
      principal.roles.includes('buyer'));

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        actions={
          canCreate ? (
            <Button onClick={() => setCreating(true)} type='button'>
              <Plus aria-hidden='true' />
              {t('procurement.orders.create')}
            </Button>
          ) : null
        }
        description={t('procurement.orders.description')}
        title={t('procurement.orders.title')}
      />

      <div className='flex items-center gap-2'>
        <span className='text-sm text-muted-foreground'>
          {t('procurement.orders.filterStatus')}
        </span>
        <select
          aria-label={t('procurement.orders.filterStatus')}
          className='h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
          onChange={(event) => setStatus(event.currentTarget.value)}
          value={status}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option || 'all'} value={option}>
              {option
                ? t(`procurement.status.${option}`)
                : t('procurement.orders.allStatuses')}
            </option>
          ))}
        </select>
      </div>

      <ErrorBanner
        message={error ? t('procurement.orders.loadFailed') : null}
      />
      {loading && !data ? (
        <Loading />
      ) : orders.length === 0 ? (
        <EmptyState message={t('procurement.orders.empty')} />
      ) : (
        <Table>
          <THead>
            <TH>{t('procurement.orders.orderNo')}</TH>
            <TH>{t('procurement.orders.supplier')}</TH>
            <TH>{t('procurement.orders.buyer')}</TH>
            <TH className='text-right'>{t('procurement.orders.amount')}</TH>
            <TH>{t('procurement.orders.status')}</TH>
            <TH>{t('procurement.orders.receiptStatus')}</TH>
            <TH className='text-right'>{t('procurement.actions')}</TH>
          </THead>
          <tbody>
            {orders.map((order) => (
              <TR key={order.id}>
                <TD className='font-mono text-xs'>{order.orderNo}</TD>
                <TD>{order.supplierName ?? '—'}</TD>
                <TD>{order.buyerName ?? '—'}</TD>
                <TD className='text-right tabular-nums'>
                  {formatCurrency(order.totalAmount)}
                </TD>
                <TD>
                  <OrderStatusBadge status={order.status} />
                </TD>
                <TD>
                  <ReceiptStatusBadge status={order.receiptStatus} />
                </TD>
                <TD className='text-right'>
                  <Button
                    onClick={() => setViewId(order.id)}
                    size='xs'
                    type='button'
                    variant='outline'
                  >
                    {t('procurement.orders.detail')}
                  </Button>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {creating || editorOrder ? (
        <OrderFormDialog
          key={editorOrder?.id ?? 'new'}
          materials={materials}
          onClose={() => {
            setCreating(false);
            setEditorOrder(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditorOrder(null);
            reload();
          }}
          order={editorOrder}
          suppliers={suppliers}
        />
      ) : null}

      {viewId !== null ? (
        <OrderDetailDialog
          canEditOrder={(order) => canEditOrder(principal, order)}
          canReview={(order) =>
            principal !== undefined &&
            (principal.isAdministrator ||
              principal.roles.includes('manager')) &&
            order.status === 'submitted' &&
            order.buyerId !== principal.userId
          }
          key={viewId}
          onChanged={reload}
          onClose={() => setViewId(null)}
          onEdit={(order) => {
            setViewId(null);
            setEditorOrder(order);
          }}
          orderId={viewId}
        />
      ) : null}
    </PageContainer>
  );
}

function canEditOrder(principal: Principal | undefined, order: Order): boolean {
  if (!principal) return false;
  if (order.status !== 'draft' && order.status !== 'rejected') return false;
  if (principal.isAdministrator || principal.roles.includes('manager'))
    return true;
  return (
    principal.roles.includes('buyer') && order.buyerId === principal.userId
  );
}

interface ItemRow {
  readonly key: string;
  materialId: string;
  quantity: string;
  unitPrice: string;
  expectedDate: string;
  remark: string;
}

function emptyRow(): ItemRow {
  return {
    key: crypto.randomUUID(),
    materialId: '',
    quantity: '1',
    unitPrice: '',
    expectedDate: '',
    remark: '',
  };
}

function OrderFormDialog({
  order,
  suppliers,
  materials,
  onClose,
  onSaved,
}: {
  order: Order | null;
  suppliers: readonly Supplier[];
  materials: readonly Material[];
  onClose: () => void;
  onSaved: () => void;
}): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const [supplierId, setSupplierId] = useState(() =>
    order
      ? String(order.supplierId)
      : suppliers[0]
        ? String(suppliers[0].id)
        : '',
  );
  const [remark, setRemark] = useState(() => order?.remark ?? '');
  const [rows, setRows] = useState<ItemRow[]>(() => {
    const items = order?.items ?? [];
    return items.length > 0
      ? items.map((item) => ({
          key: crypto.randomUUID(),
          materialId: String(item.materialId),
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
          expectedDate: item.expectedDate ?? '',
          remark: item.remark ?? '',
        }))
      : [emptyRow()];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = rows.reduce((sum, row) => {
    const quantity = Number(row.quantity);
    const unitPrice = Number(row.unitPrice);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return sum;
    return sum + quantity * unitPrice;
  }, 0);

  const save = async (): Promise<void> => {
    setError(null);
    const items = rows
      .filter((row) => row.materialId !== '')
      .map((row) => ({
        materialId: Number(row.materialId),
        quantity: Number(row.quantity),
        unitPrice: Number(row.unitPrice),
        expectedDate: row.expectedDate || null,
        remark: row.remark || null,
      }));
    if (!supplierId || items.length === 0) {
      setError(t('procurement.orders.formIncomplete'));
      return;
    }
    setSaving(true);
    try {
      const input: OrderInput = {
        supplierId: Number(supplierId),
        remark: remark || null,
        items,
      };
      if (order) {
        await updateOrder(api, order.id, input);
      } else {
        await createOrder(api, input);
      }
      onSaved();
    } catch (cause) {
      setError(orderErrorMessage(t, errorCode(cause)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      // A form with unsaved line items must not close from a stray outside
      // press — native date pickers (used by the 预计到货日期 field) are an
      // "outside" surface for Base UI and dismissing on them discarded the
      // whole draft. Cancel/close remain explicit.
      disablePointerDismissal
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
    >
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>
            {order
              ? t('procurement.orders.edit')
              : t('procurement.orders.create')}
          </DialogTitle>
          <DialogDescription>
            {t('procurement.orders.formDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className='max-h-[70vh] space-y-4 overflow-auto pr-1'>
          <ErrorBanner message={error} />
          <Field label={t('procurement.orders.supplier')}>
            <select
              aria-label={t('procurement.orders.supplier')}
              className='h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
              onChange={(event) => setSupplierId(event.currentTarget.value)}
              value={supplierId}
            >
              <option value=''>{t('procurement.orders.selectSupplier')}</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </Field>

          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-medium'>
                {t('procurement.orders.items')}
              </span>
              <Button
                onClick={() => setRows((current) => [...current, emptyRow()])}
                size='xs'
                type='button'
                variant='outline'
              >
                <Plus aria-hidden='true' />
                {t('procurement.orders.addItem')}
              </Button>
            </div>
            {rows.map((row, index) => (
              <div
                className='grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-12'
                key={row.key}
              >
                <div className='sm:col-span-4'>
                  <label className='text-xs text-muted-foreground'>
                    {t('procurement.orders.material')}
                  </label>
                  <select
                    aria-label={`${t('procurement.orders.material')} ${index + 1}`}
                    className='mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
                    onChange={(event) => {
                      const materialId = event.currentTarget.value;
                      setRows((current) =>
                        current.map((item) =>
                          item.key === row.key ? { ...item, materialId } : item,
                        ),
                      );
                    }}
                    value={row.materialId}
                  >
                    <option value=''>
                      {t('procurement.orders.selectMaterial')}
                    </option>
                    {materials.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.code} {material.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className='sm:col-span-2'>
                  <label className='text-xs text-muted-foreground'>
                    {t('procurement.orders.quantity')}
                  </label>
                  <Input
                    aria-label={`${t('procurement.orders.quantity')} ${index + 1}`}
                    className='mt-1'
                    min='0'
                    onChange={(event) => {
                      const quantity = event.currentTarget.value;
                      setRows((current) =>
                        current.map((item) =>
                          item.key === row.key ? { ...item, quantity } : item,
                        ),
                      );
                    }}
                    step='any'
                    type='number'
                    value={row.quantity}
                  />
                </div>
                <div className='sm:col-span-2'>
                  <label className='text-xs text-muted-foreground'>
                    {t('procurement.orders.unitPrice')}
                  </label>
                  <Input
                    aria-label={`${t('procurement.orders.unitPrice')} ${index + 1}`}
                    className='mt-1'
                    min='0'
                    onChange={(event) => {
                      const unitPrice = event.currentTarget.value;
                      setRows((current) =>
                        current.map((item) =>
                          item.key === row.key ? { ...item, unitPrice } : item,
                        ),
                      );
                    }}
                    step='any'
                    type='number'
                    value={row.unitPrice}
                  />
                </div>
                <div className='sm:col-span-3'>
                  <label className='text-xs text-muted-foreground'>
                    {t('procurement.orders.expectedDate')}
                  </label>
                  <Input
                    aria-label={`${t('procurement.orders.expectedDate')} ${index + 1}`}
                    className='mt-1'
                    onChange={(event) => {
                      const expectedDate = event.currentTarget.value;
                      setRows((current) =>
                        current.map((item) =>
                          item.key === row.key
                            ? { ...item, expectedDate }
                            : item,
                        ),
                      );
                    }}
                    type='date'
                    value={row.expectedDate}
                  />
                </div>
                <div className='flex items-end justify-end sm:col-span-1'>
                  <Button
                    aria-label={t('procurement.orders.removeItem')}
                    disabled={rows.length === 1}
                    onClick={() =>
                      setRows((current) =>
                        current.filter((item) => item.key !== row.key),
                      )
                    }
                    size='icon-sm'
                    type='button'
                    variant='ghost'
                  >
                    <Trash2 aria-hidden='true' />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Field label={t('procurement.orders.remark')}>
            <Input
              onChange={(event) => setRemark(event.currentTarget.value)}
              value={remark}
            />
          </Field>

          <p className='text-right text-sm'>
            {t('procurement.orders.total')}:{' '}
            <span className='font-heading text-lg font-semibold tabular-nums'>
              {formatCurrency(total)}
            </span>
          </p>
        </div>
        <DialogFooter>
          <Button onClick={onClose} type='button' variant='outline'>
            {t('actions.cancel')}
          </Button>
          <Button
            disabled={saving}
            onClick={() => {
              void save();
            }}
            type='button'
          >
            {saving ? t('procurement.saving') : t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderDetailDialog({
  orderId,
  canEditOrder: canEdit,
  canReview,
  onClose,
  onEdit,
  onChanged,
}: {
  orderId: number;
  canEditOrder: (order: Order) => boolean;
  canReview: (order: Order) => boolean;
  onClose: () => void;
  onEdit: (order: Order) => void;
  onChanged: () => void;
}): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const [order, setOrder] = useState<Order | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    getOrder(api, orderId)
      .then((data) => {
        if (!cancelled) setOrder(data);
      })
      .catch(() => {
        if (!cancelled) setError(t('procurement.orders.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, api, t]);

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setOrder(await getOrder(api, orderId));
      onChanged();
    } catch (cause) {
      setError(orderErrorMessage(t, errorCode(cause)));
    } finally {
      setBusy(false);
    }
  };

  // The server owns attachment permissions, but an order that just left
  // draft/rejected must lock its attachment controls in the same render — and
  // re-read the server state — instead of waiting for a manual reopen.
  const attachmentsReadOnly =
    order !== undefined &&
    order.status !== 'draft' &&
    order.status !== 'rejected';

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
    >
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle className='font-mono'>
            {order?.orderNo ?? t('procurement.orders.detail')}
          </DialogTitle>
          <DialogDescription>
            {order
              ? `${order.supplierName ?? ''} · ${
                  order.buyerName ?? ''
                } · ${formatDateTime(order.createdAt)}`
              : ''}
          </DialogDescription>
        </DialogHeader>
        {order ? (
          <div className='max-h-[70vh] space-y-4 overflow-auto pr-1'>
            <ErrorBanner message={error} />
            <div className='flex flex-wrap items-center gap-2'>
              <OrderStatusBadge status={order.status} />
              <ReceiptStatusBadge status={order.receiptStatus} />
              <span className='text-sm text-muted-foreground'>
                {t('procurement.orders.total')}:{' '}
                <span className='tabular-nums'>
                  {formatCurrency(order.totalAmount)}
                </span>
              </span>
            </div>
            {order.rejectReason ? (
              <p className='rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
                {t('procurement.orders.rejectReason')}: {order.rejectReason}
              </p>
            ) : null}
            {order.remark ? (
              <p className='text-sm text-muted-foreground'>{order.remark}</p>
            ) : null}

            <div className='space-y-2'>
              <h3 className='text-sm font-medium'>
                {t('procurement.orders.items')}
              </h3>
              <Table>
                <THead>
                  <TH>{t('procurement.orders.material')}</TH>
                  <TH className='text-right'>
                    {t('procurement.orders.quantity')}
                  </TH>
                  <TH className='text-right'>
                    {t('procurement.orders.unitPrice')}
                  </TH>
                  <TH className='text-right'>
                    {t('procurement.orders.itemAmount')}
                  </TH>
                  <TH className='text-right'>
                    {t('procurement.receipts.received')}
                  </TH>
                  <TH>{t('procurement.orders.expectedDate')}</TH>
                </THead>
                <tbody>
                  {(order.items ?? []).map((item) => (
                    <TR key={item.id}>
                      <TD>
                        <span className='font-mono text-xs'>
                          {item.materialCode}
                        </span>{' '}
                        {item.materialName}
                        {item.spec ? (
                          <span className='text-muted-foreground'>
                            {' '}
                            / {item.spec}
                          </span>
                        ) : null}
                      </TD>
                      <TD className='text-right tabular-nums'>
                        {formatQuantity(item.quantity)} {item.unit}
                      </TD>
                      <TD className='text-right tabular-nums'>
                        {formatAmount(item.unitPrice)}
                      </TD>
                      <TD className='text-right tabular-nums'>
                        {formatAmount(item.amount)}
                      </TD>
                      <TD className='text-right tabular-nums'>
                        {formatQuantity(item.receivedQuantity)}
                      </TD>
                      <TD>{formatDate(item.expectedDate)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>

            <div className='flex flex-wrap gap-2'>
              {canEdit(order) ? (
                <Button
                  onClick={() => onEdit(order)}
                  size='sm'
                  type='button'
                  variant='outline'
                >
                  {t('procurement.orders.edit')}
                </Button>
              ) : null}
              {canEdit(order) ? (
                <Button
                  disabled={busy}
                  onClick={() => {
                    void run(() => submitOrder(api, order.id));
                  }}
                  size='sm'
                  type='button'
                >
                  {t('procurement.orders.submit')}
                </Button>
              ) : null}
              {canReview(order) ? (
                <>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      void run(() => approveOrder(api, order.id));
                    }}
                    size='sm'
                    type='button'
                  >
                    {t('procurement.orders.approve')}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => setRejecting(true)}
                    size='sm'
                    type='button'
                    variant='destructive'
                  >
                    {t('procurement.orders.reject')}
                  </Button>
                </>
              ) : null}
            </div>

            {rejecting ? (
              <div className='space-y-2 rounded-lg border border-border p-3'>
                <Field label={t('procurement.orders.rejectReason')}>
                  <Input
                    onChange={(event) => setReason(event.currentTarget.value)}
                    value={reason}
                  />
                </Field>
                <div className='flex justify-end gap-2'>
                  <Button
                    onClick={() => setRejecting(false)}
                    size='sm'
                    type='button'
                    variant='outline'
                  >
                    {t('actions.cancel')}
                  </Button>
                  <Button
                    disabled={busy || reason.trim() === ''}
                    onClick={() => {
                      setRejecting(false);
                      void run(() => rejectOrder(api, order.id, reason));
                    }}
                    size='sm'
                    type='button'
                    variant='destructive'
                  >
                    {t('procurement.orders.rejectConfirm')}
                  </Button>
                </div>
              </div>
            ) : null}

            <AttachmentPanel
              category='quotation'
              description={t('procurement.orders.quotationDescription')}
              readOnly={attachmentsReadOnly}
              revision={order.status}
              targetId={order.id}
              targetType='order'
              title={t('procurement.orders.quotation')}
            />
            <AttachmentPanel
              category='contract'
              description={t('procurement.orders.contractDescription')}
              readOnly={attachmentsReadOnly}
              revision={order.status}
              targetId={order.id}
              targetType='order'
              title={t('procurement.orders.contract')}
            />
          </div>
        ) : error ? (
          <ErrorBanner message={error} />
        ) : (
          <Loading />
        )}
        <DialogFooter>
          <Button onClick={onClose} type='button' variant='outline'>
            {t('actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function orderErrorMessage(
  t: (key: string, options?: Record<string, unknown>) => string,
  code: string | undefined,
): string {
  switch (code) {
    case 'SUPPLIER_NOT_OWNED':
      return t('procurement.orders.supplierNotOwned');
    case 'ORDER_NOT_EDITABLE':
      return t('procurement.orders.notEditable');
    case 'ORDER_NOT_SUBMITTABLE':
      return t('procurement.orders.notSubmittable');
    case 'ORDER_NOT_REVIEWABLE':
      return t('procurement.orders.notReviewable');
    case 'ORDER_SELF_APPROVAL':
      return t('procurement.orders.selfApproval');
    case 'ORDER_EMPTY':
      return t('procurement.orders.emptyItems');
    case 'FORBIDDEN':
    case 'UNAUTHORIZED':
      return t('procurement.forbidden');
    default:
      return t('procurement.saveFailed');
  }
}
