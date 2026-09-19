import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AttachmentPanel } from '@/components/procurement/attachment-panel.js';
import {
  createSupplier,
  errorCode,
  getPrincipal,
  listSuppliers,
  updateSupplier,
  type Supplier,
} from '@/components/procurement/api.js';
import { formatDateTime } from '@/components/procurement/format.js';
import {
  EmptyState,
  ErrorBanner,
  Field,
  SupplierStatusBadge,
  Table,
  TD,
  TH,
  THead,
  TR,
} from '@/components/procurement/ui.js';
import { useAsyncData } from '@/components/procurement/use-async-data.js';

export default function ProcurementSuppliersPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsyncData(
    () => Promise.all([listSuppliers(api), getPrincipal(api)]),
    [api],
  );
  const suppliers = data?.[0] ?? [];
  const principal = data?.[1];
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Supplier | null>(null);

  const canManage = (supplier: Supplier): boolean => {
    if (!principal) return false;
    if (principal.isAdministrator || principal.roles.includes('manager')) {
      return true;
    }
    return (
      principal.roles.includes('buyer') && supplier.ownerId === principal.userId
    );
  };
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
              {t('procurement.suppliers.create')}
            </Button>
          ) : null
        }
        description={t('procurement.suppliers.description')}
        title={t('procurement.suppliers.title')}
      />
      <ErrorBanner
        message={error ? t('procurement.suppliers.loadFailed') : null}
      />
      {loading && !data ? (
        <Loading />
      ) : suppliers.length === 0 ? (
        <EmptyState message={t('procurement.suppliers.empty')} />
      ) : (
        <Table>
          <THead>
            <TH>{t('procurement.suppliers.name')}</TH>
            <TH>{t('procurement.suppliers.contactName')}</TH>
            <TH>{t('procurement.suppliers.phone')}</TH>
            <TH>{t('procurement.suppliers.status')}</TH>
            <TH>{t('procurement.suppliers.owner')}</TH>
            <TH className='text-right'>{t('procurement.actions')}</TH>
          </THead>
          <tbody>
            {suppliers.map((supplier) => (
              <TR key={supplier.id}>
                <TD className='font-medium'>{supplier.name}</TD>
                <TD>{supplier.contactName ?? '—'}</TD>
                <TD>{supplier.phone ?? '—'}</TD>
                <TD>
                  <SupplierStatusBadge status={supplier.status} />
                </TD>
                <TD className='text-muted-foreground'>
                  {supplier.ownerName ?? '—'}
                </TD>
                <TD className='text-right'>
                  <span className='inline-flex gap-1'>
                    <Button
                      onClick={() => setDetail(supplier)}
                      size='xs'
                      type='button'
                      variant='ghost'
                    >
                      {t('procurement.suppliers.detail')}
                    </Button>
                    {canManage(supplier) ? (
                      <Button
                        onClick={() => setEditing(supplier)}
                        size='xs'
                        type='button'
                        variant='outline'
                      >
                        {t('procurement.edit')}
                      </Button>
                    ) : null}
                  </span>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {creating || editing ? (
        <SupplierFormDialog
          key={editing?.id ?? 'new'}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            reload();
          }}
          supplier={editing}
        />
      ) : null}

      {detail ? (
        <SupplierDetailDialog
          key={detail.id}
          onClose={() => setDetail(null)}
          supplier={detail}
        />
      ) : null}
    </PageContainer>
  );
}

function SupplierFormDialog({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    contactName: supplier?.contactName ?? '',
    phone: supplier?.phone ?? '',
    status: supplier?.status ?? 'active',
    remark: supplier?.remark ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    setSaving(true);
    setFormError(null);
    try {
      if (supplier) {
        await updateSupplier(api, supplier.id, form);
      } else {
        await createSupplier(api, form);
      }
      onSaved();
    } catch (cause) {
      const code = errorCode(cause);
      if (code === 'SUPPLIER_NAME_TAKEN') {
        setFormError(t('procurement.suppliers.nameTaken'));
      } else if (code === 'FORBIDDEN' || code === 'UNAUTHORIZED') {
        setFormError(t('procurement.forbidden'));
      } else {
        setFormError(t('procurement.saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {supplier
              ? t('procurement.suppliers.edit')
              : t('procurement.suppliers.create')}
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-3'>
          <ErrorBanner message={formError} />
          <Field label={t('procurement.suppliers.name')}>
            <Input
              onChange={(event) => {
                const name = event.currentTarget.value;
                setForm((current) => ({ ...current, name }));
              }}
              value={form.name}
            />
          </Field>
          <Field label={t('procurement.suppliers.contactName')}>
            <Input
              onChange={(event) => {
                const contactName = event.currentTarget.value;
                setForm((current) => ({ ...current, contactName }));
              }}
              value={form.contactName}
            />
          </Field>
          <Field label={t('procurement.suppliers.phone')}>
            <Input
              onChange={(event) => {
                const phone = event.currentTarget.value;
                setForm((current) => ({ ...current, phone }));
              }}
              value={form.phone}
            />
          </Field>
          <Field label={t('procurement.suppliers.status')}>
            <select
              aria-label={t('procurement.suppliers.status')}
              className='h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
              onChange={(event) => {
                const status = event.currentTarget.value as
                  'active' | 'inactive';
                setForm((current) => ({ ...current, status }));
              }}
              value={form.status}
            >
              <option value='active'>
                {t('procurement.supplierStatus.active')}
              </option>
              <option value='inactive'>
                {t('procurement.supplierStatus.inactive')}
              </option>
            </select>
          </Field>
          <Field label={t('procurement.suppliers.remark')}>
            <Input
              onChange={(event) => {
                const remark = event.currentTarget.value;
                setForm((current) => ({ ...current, remark }));
              }}
              value={form.remark}
            />
          </Field>
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

function SupplierDetailDialog({
  supplier,
  onClose,
}: {
  supplier: Supplier;
  onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
    >
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{supplier.name}</DialogTitle>
        </DialogHeader>
        <div className='max-h-[70vh] space-y-4 overflow-auto pr-1'>
          <dl className='grid gap-2 text-sm sm:grid-cols-2'>
            <Detail label={t('procurement.suppliers.contactName')}>
              {supplier.contactName ?? '—'}
            </Detail>
            <Detail label={t('procurement.suppliers.phone')}>
              {supplier.phone ?? '—'}
            </Detail>
            <Detail label={t('procurement.suppliers.status')}>
              <SupplierStatusBadge status={supplier.status} />
            </Detail>
            <Detail label={t('procurement.suppliers.owner')}>
              {supplier.ownerName ?? '—'}
            </Detail>
            <Detail label={t('procurement.suppliers.remark')}>
              {supplier.remark ?? '—'}
            </Detail>
            <Detail label={t('procurement.suppliers.updatedAt')}>
              {formatDateTime(supplier.updatedAt)}
            </Detail>
          </dl>
          <AttachmentPanel
            category='license'
            description={t('procurement.suppliers.licenseDescription')}
            targetId={supplier.id}
            targetType='supplier'
            title={t('procurement.suppliers.license')}
          />
          <AttachmentPanel
            category='qualification'
            description={t('procurement.suppliers.qualificationDescription')}
            targetId={supplier.id}
            targetType='supplier'
            title={t('procurement.suppliers.qualification')}
          />
        </div>
        <DialogFooter>
          <Button onClick={onClose} type='button' variant='outline'>
            {t('actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='mt-0.5'>{children}</dd>
    </div>
  );
}
