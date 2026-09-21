import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { Link } from 'react-router';

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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { useAccess } from '../access.js';
import {
  complianceRequest,
  errorMessageKey,
  normalizeError,
  SUPPLIER_STATUSES,
  type NormalizedError,
  type Organization,
  type Supplier,
} from '../api.js';
import { SimpleSelect } from '../components/simple-select.js';
import { StatusBadge } from '../components/status-badge.js';
import { EmptyState, ErrorState, LoadingState } from '../components/state.js';
import { supplierStatusKey, supplierStatusTone } from '../labels.js';
import {
  canManageOrganization,
  canManageSupplier,
  organizationOptions,
} from '../permissions.js';

interface SupplierFormState {
  organizationId: string;
  name: string;
  code: string;
  category: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  businessScope: string;
  notes: string;
}

const EMPTY_FORM: SupplierFormState = {
  organizationId: '',
  name: '',
  code: '',
  category: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  businessScope: '',
  notes: '',
};

export default function SuppliersPage(): ReactElement {
  const { t } = useTranslation();
  const {
    api,
    access,
    loading: accessLoading,
    error: accessError,
  } = useAccess();

  const [suppliers, setSuppliers] = useState<readonly Supplier[]>([]);
  const [organizations, setOrganizations] = useState<readonly Organization[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<NormalizedError>();
  const [notice, setNotice] = useState<string>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<SupplierFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [submittingId, setSubmittingId] = useState<number>();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [supplierData, organizationData] = await Promise.all([
        complianceRequest<Supplier[]>(api, '/suppliers', {
          query: {
            search: search.trim() || undefined,
            status: status || undefined,
            organizationId: organizationId || undefined,
          },
        }),
        complianceRequest<Organization[]>(api, '/organizations'),
      ]);
      setSuppliers(supplierData);
      setOrganizations(organizationData);
    } catch (cause) {
      setError(normalizeError(cause));
    } finally {
      setLoading(false);
    }
  }, [api, organizationId, search, status]);

  useEffect(() => {
    if (accessLoading || accessError) return;
    // Defer to a microtask so the effect body itself does not synchronously update state.
    queueMicrotask(() => void reload());
  }, [accessLoading, accessError, reload]);

  const manageableOrganizations = useMemo(
    () => organizationOptions(access, organizations),
    [access, organizations],
  );

  const canCreate = manageableOrganizations.some((organization) =>
    canManageOrganization(access, organization.id),
  );

  async function handleCreate(): Promise<void> {
    setSaving(true);
    setNotice(undefined);
    try {
      await complianceRequest<Supplier>(api, '/suppliers', {
        method: 'POST',
        json: {
          organizationId: Number(form.organizationId),
          name: form.name,
          code: form.code,
          category: form.category || undefined,
          contactName: form.contactName || undefined,
          contactEmail: form.contactEmail || undefined,
          contactPhone: form.contactPhone || undefined,
          businessScope: form.businessScope || undefined,
          notes: form.notes || undefined,
        },
      });
      setCreating(false);
      setForm(EMPTY_FORM);
      await reload();
    } catch (cause) {
      const normalized = normalizeError(cause);
      setNotice(
        t(errorMessageKey(normalized), { defaultValue: normalized.message }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(supplier: Supplier): Promise<void> {
    setSubmittingId(supplier.id);
    setNotice(undefined);
    try {
      await complianceRequest<Supplier>(
        api,
        `/suppliers/${supplier.id}/submit`,
        {
          method: 'POST',
        },
      );
      await reload();
    } catch (cause) {
      const normalized = normalizeError(cause);
      setNotice(
        t(errorMessageKey(normalized), { defaultValue: normalized.message }),
      );
    } finally {
      setSubmittingId(undefined);
    }
  }

  if (accessLoading) {
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }

  if (accessError) {
    return (
      <PageContainer>
        <ErrorState error={accessError} onRetry={() => void reload()} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('compliance.suppliers.title', {
          defaultValue: 'Supplier archive',
        })}
        description={t('compliance.suppliers.description', {
          defaultValue:
            'Suppliers in your procurement organizations, with their qualification status.',
        })}
        actions={
          canCreate ? (
            <Button
              onClick={() => setCreating(true)}
              data-testid='compliance-supplier-create'
            >
              <PlusIcon />
              {t('compliance.suppliers.create', {
                defaultValue: 'New supplier',
              })}
            </Button>
          ) : null
        }
      />

      {notice ? (
        <p className='text-sm text-destructive' role='alert'>
          {notice}
        </p>
      ) : null}

      <div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
        <div className='flex-1'>
          <Label htmlFor='supplier-search'>
            {t('compliance.suppliers.search', { defaultValue: 'Search' })}
          </Label>
          <Input
            id='supplier-search'
            className='mt-1'
            value={search}
            placeholder={t('compliance.suppliers.searchPlaceholder', {
              defaultValue: 'Name or code',
            })}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className='w-full sm:w-44'>
          <Label>
            {t('compliance.suppliers.status', { defaultValue: 'Status' })}
          </Label>
          <SimpleSelect
            value={status}
            onChange={setStatus}
            className='mt-1'
            placeholder={t('compliance.filters.all', { defaultValue: 'All' })}
            options={SUPPLIER_STATUSES.map((value) => ({
              value,
              label: t(supplierStatusKey(value), { defaultValue: value }),
            }))}
          />
        </div>
        <div className='w-full sm:w-52'>
          <Label>
            {t('compliance.suppliers.organization', {
              defaultValue: 'Organization',
            })}
          </Label>
          <SimpleSelect
            value={organizationId}
            onChange={setOrganizationId}
            className='mt-1'
            placeholder={t('compliance.filters.all', { defaultValue: 'All' })}
            options={manageableOrganizations.map((organization) => ({
              value: String(organization.id),
              label: `${organization.name} (${organization.code})`,
            }))}
          />
        </div>
      </div>

      {loading ? <LoadingState /> : null}
      {error ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : null}

      {!loading && !error && suppliers.length === 0 ? (
        <EmptyState>
          {t('compliance.suppliers.empty', {
            defaultValue: 'No suppliers found.',
          })}
        </EmptyState>
      ) : null}

      {!loading && !error && suppliers.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {t('compliance.suppliers.code', { defaultValue: 'Code' })}
              </TableHead>
              <TableHead>
                {t('compliance.suppliers.name', { defaultValue: 'Name' })}
              </TableHead>
              <TableHead>
                {t('compliance.suppliers.organization', {
                  defaultValue: 'Organization',
                })}
              </TableHead>
              <TableHead>
                {t('compliance.suppliers.status', { defaultValue: 'Status' })}
              </TableHead>
              <TableHead>
                {t('compliance.suppliers.compliance', {
                  defaultValue: 'Qualification',
                })}
              </TableHead>
              <TableHead className='text-right'>
                {t('compliance.suppliers.actions', { defaultValue: 'Actions' })}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((supplier) => (
              <TableRow key={supplier.id}>
                <TableCell className='font-mono text-xs'>
                  {supplier.code}
                </TableCell>
                <TableCell>
                  <Link
                    to={`/compliance/suppliers/${supplier.id}`}
                    className='font-medium hover:underline'
                  >
                    {supplier.name}
                  </Link>
                  {supplier.category ? (
                    <span className='block text-xs text-muted-foreground'>
                      {supplier.category}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>{supplier.organizationName ?? '—'}</TableCell>
                <TableCell>
                  <StatusBadge
                    tone={supplierStatusTone(supplier.status)}
                    labelKey={supplierStatusKey(supplier.status)}
                  />
                </TableCell>
                <TableCell>
                  {supplier.compliance.eligible ? (
                    <StatusBadge
                      tone='default'
                      labelKey='compliance.compliance.eligible'
                      fallback='Qualification complete'
                    />
                  ) : (
                    <span className='flex flex-wrap gap-1'>
                      {supplier.compliance.missing.map((type) => (
                        <StatusBadge
                          key={`missing-${type}`}
                          tone='destructive'
                          labelKey='compliance.compliance.missing'
                          fallback={`Missing: ${type}`}
                        />
                      ))}
                      {supplier.compliance.expired.map((type) => (
                        <StatusBadge
                          key={`expired-${type}`}
                          tone='destructive'
                          labelKey='compliance.compliance.expired'
                          fallback={`Expired: ${type}`}
                        />
                      ))}
                      {supplier.compliance.expiringSoon.map((type) => (
                        <StatusBadge
                          key={`soon-${type}`}
                          tone='secondary'
                          labelKey='compliance.compliance.expiringSoon'
                          fallback={`Expiring soon: ${type}`}
                        />
                      ))}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className='flex justify-end gap-1'>
                    <Button
                      variant='outline'
                      size='sm'
                      render={
                        <Link to={`/compliance/suppliers/${supplier.id}`} />
                      }
                    >
                      {t('compliance.suppliers.view', { defaultValue: 'View' })}
                    </Button>
                    {canManageSupplier(access, supplier) &&
                    supplier.status !== 'pending_review' &&
                    supplier.status !== 'qualified' ? (
                      <Button
                        variant='secondary'
                        size='sm'
                        disabled={submittingId === supplier.id}
                        onClick={() => void handleSubmit(supplier)}
                      >
                        {t('compliance.suppliers.submit', {
                          defaultValue: 'Submit for review',
                        })}
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {t('compliance.suppliers.createTitle', {
                defaultValue: 'New supplier',
              })}
            </DialogTitle>
            <DialogDescription>
              {t('compliance.suppliers.createDescription', {
                defaultValue:
                  'A new supplier starts as a draft until a quality review approves it.',
              })}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='sm:col-span-2'>
              <Label>
                {t('compliance.suppliers.organization', {
                  defaultValue: 'Organization',
                })}
              </Label>
              <SimpleSelect
                value={form.organizationId}
                onChange={(value) =>
                  setForm({ ...form, organizationId: value })
                }
                className='mt-1'
                placeholder={t('compliance.suppliers.selectOrganization', {
                  defaultValue: 'Select an organization',
                })}
                options={manageableOrganizations.map((organization) => ({
                  value: String(organization.id),
                  label: `${organization.name} (${organization.code})`,
                }))}
              />
            </div>
            <div>
              <Label htmlFor='supplier-name'>
                {t('compliance.suppliers.name', { defaultValue: 'Name' })}
              </Label>
              <Input
                id='supplier-name'
                className='mt-1'
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor='supplier-code'>
                {t('compliance.suppliers.code', { defaultValue: 'Code' })}
              </Label>
              <Input
                id='supplier-code'
                className='mt-1'
                value={form.code}
                onChange={(event) =>
                  setForm({ ...form, code: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor='supplier-category'>
                {t('compliance.suppliers.category', {
                  defaultValue: 'Category',
                })}
              </Label>
              <Input
                id='supplier-category'
                className='mt-1'
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor='supplier-contact'>
                {t('compliance.suppliers.contactName', {
                  defaultValue: 'Contact name',
                })}
              </Label>
              <Input
                id='supplier-contact'
                className='mt-1'
                value={form.contactName}
                onChange={(event) =>
                  setForm({ ...form, contactName: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor='supplier-email'>
                {t('compliance.suppliers.contactEmail', {
                  defaultValue: 'Contact email',
                })}
              </Label>
              <Input
                id='supplier-email'
                type='email'
                className='mt-1'
                value={form.contactEmail}
                onChange={(event) =>
                  setForm({ ...form, contactEmail: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor='supplier-phone'>
                {t('compliance.suppliers.contactPhone', {
                  defaultValue: 'Contact phone',
                })}
              </Label>
              <Input
                id='supplier-phone'
                className='mt-1'
                value={form.contactPhone}
                onChange={(event) =>
                  setForm({ ...form, contactPhone: event.target.value })
                }
              />
            </div>
            <div className='sm:col-span-2'>
              <Label htmlFor='supplier-scope'>
                {t('compliance.suppliers.businessScope', {
                  defaultValue: 'Business scope',
                })}
              </Label>
              <Textarea
                id='supplier-scope'
                className='mt-1'
                value={form.businessScope}
                onChange={(event) =>
                  setForm({ ...form, businessScope: event.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              type='button'
              onClick={() => setCreating(false)}
            >
              {t('actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              type='button'
              disabled={
                saving ||
                !form.organizationId ||
                !form.name.trim() ||
                !form.code.trim()
              }
              onClick={() => void handleCreate()}
            >
              {t('actions.save', { defaultValue: 'Save' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
