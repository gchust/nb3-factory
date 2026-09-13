import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useState, type ReactElement } from 'react';

import { AttachmentField } from '@/components/procurement/attachment-field';
import {
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
  messageOf,
  useLoaded,
  useProcurementApi,
  type SupplierCategory,
  type SupplierInput,
  type SupplierStatus,
} from '@/lib/procurement-api';

const EMPTY_FORM: SupplierInput = {
  name: '',
  unifiedSocialCreditCode: '',
  contactName: '',
  contactPhone: '',
  category: 'material',
  status: 'active',
};

export default function SuppliersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useProcurementApi();
  const [category, setCategory] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [form, setForm] = useState<SupplierInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const meLoader = useCallback(() => api.me(), [api]);
  const { data: me } = useLoaded(meLoader);

  const suppliersLoader = useCallback(
    () => api.listSuppliers({ category, search: appliedSearch }),
    [api, category, appliedSearch],
  );
  const {
    data: suppliers,
    loading,
    error: loadError,
    reload,
  } = useLoaded(suppliersLoader);

  if (me && !me.capabilities.manageSuppliers) {
    return (
      <ProcurementPage title={t('procurement.suppliers.title')}>
        <ErrorLine message={t('procurement.denied')} />
      </ProcurementPage>
    );
  }

  const submit = async (event: { preventDefault(): void }): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await api.createSupplier(form);
      setForm(EMPTY_FORM);
      setMessage(t('procurement.suppliers.created'));
      reload();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProcurementPage title={t('procurement.suppliers.title')}>
      <ProcurementCard title={t('procurement.suppliers.createTitle')}>
        <form
          className='grid gap-4 md:grid-cols-2'
          onSubmit={(event) => void submit(event)}
        >
          <div className='space-y-2'>
            <Label htmlFor='supplier-name'>
              {t('procurement.suppliers.name')}
            </Label>
            <Input
              id='supplier-name'
              required
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='supplier-credit'>
              {t('procurement.suppliers.creditCode')}
            </Label>
            <Input
              id='supplier-credit'
              value={form.unifiedSocialCreditCode}
              onChange={(event) =>
                setForm({
                  ...form,
                  unifiedSocialCreditCode: event.target.value,
                })
              }
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='supplier-contact'>
              {t('procurement.suppliers.contactName')}
            </Label>
            <Input
              id='supplier-contact'
              value={form.contactName}
              onChange={(event) =>
                setForm({ ...form, contactName: event.target.value })
              }
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='supplier-phone'>
              {t('procurement.suppliers.contactPhone')}
            </Label>
            <Input
              id='supplier-phone'
              value={form.contactPhone}
              onChange={(event) =>
                setForm({ ...form, contactPhone: event.target.value })
              }
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='supplier-category'>
              {t('procurement.category.label')}
            </Label>
            <select
              id='supplier-category'
              className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
              value={form.category}
              onChange={(event) =>
                setForm({
                  ...form,
                  category: event.target.value as SupplierCategory,
                })
              }
            >
              <option value='material'>
                {t('procurement.category.material')}
              </option>
              <option value='service'>
                {t('procurement.category.service')}
              </option>
              <option value='engineering'>
                {t('procurement.category.engineering')}
              </option>
            </select>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='supplier-status'>
              {t('procurement.supplierStatus.label')}
            </Label>
            <select
              id='supplier-status'
              className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
              value={form.status}
              onChange={(event) =>
                setForm({
                  ...form,
                  status: event.target.value as SupplierStatus,
                })
              }
            >
              <option value='active'>
                {t('procurement.supplierStatus.active')}
              </option>
              <option value='disabled'>
                {t('procurement.supplierStatus.disabled')}
              </option>
            </select>
          </div>
          <div className='flex items-center gap-3 md:col-span-2'>
            <Button type='submit' disabled={saving}>
              {saving ? t('procurement.saving') : t('procurement.save')}
            </Button>
            {message ? (
              <span className='text-sm text-muted-foreground'>{message}</span>
            ) : null}
          </div>
        </form>
        {error ? <ErrorLine message={error} /> : null}
      </ProcurementCard>

      <ProcurementCard title={t('procurement.suppliers.title')}>
        <div className='flex flex-wrap items-end gap-3'>
          <div className='space-y-2'>
            <Label htmlFor='supplier-filter'>
              {t('procurement.suppliers.filterCategory')}
            </Label>
            <select
              id='supplier-filter'
              className='h-8 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value=''>
                {t('procurement.suppliers.allCategories')}
              </option>
              <option value='material'>
                {t('procurement.category.material')}
              </option>
              <option value='service'>
                {t('procurement.category.service')}
              </option>
              <option value='engineering'>
                {t('procurement.category.engineering')}
              </option>
            </select>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='supplier-search'>
              {t('procurement.suppliers.search')}
            </Label>
            <Input
              id='supplier-search'
              placeholder={t('procurement.suppliers.searchPlaceholder')}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <Button
            type='button'
            variant='outline'
            onClick={() => setAppliedSearch(searchInput.trim())}
          >
            {t('procurement.suppliers.search')}
          </Button>
        </div>

        {loading ? <LoadingLine /> : null}
        {loadError ? <ErrorLine message={loadError} /> : null}
        {suppliers ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('procurement.suppliers.name')}</TableHead>
                <TableHead>{t('procurement.suppliers.creditCode')}</TableHead>
                <TableHead>{t('procurement.suppliers.contactName')}</TableHead>
                <TableHead>{t('procurement.category.label')}</TableHead>
                <TableHead>{t('procurement.supplierStatus.label')}</TableHead>
                <TableHead>{t('procurement.files')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className='font-medium'>{supplier.name}</TableCell>
                  <TableCell className='text-muted-foreground'>
                    {supplier.unifiedSocialCreditCode ?? '—'}
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {supplier.contactName ?? '—'}
                    {supplier.contactPhone ? ` · ${supplier.contactPhone}` : ''}
                  </TableCell>
                  <TableCell>
                    {t(`procurement.category.${supplier.category}`)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind='supplier' status={supplier.status} />
                  </TableCell>
                  <TableCell className='min-w-56'>
                    <AttachmentField
                      ownerType='supplier'
                      ownerId={supplier.id}
                      files={supplier.files}
                      onUploaded={reload}
                    />
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
