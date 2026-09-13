import { useTranslation } from '@nocobase/i18n/client';
import { Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';

import { AttachmentField } from '@/components/it/attachment-field.js';
import { EnumSelect, type EnumOption } from '@/components/it/enum-select.js';
import { PageHeader } from '@/components/it/page-header.js';
import { StatusBadge } from '@/components/it/status-badge.js';
import { Loading } from '@/components/loading.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table.js';
import {
  useItApi,
  type AssetInput,
  type ItAsset,
  type ItFile,
} from '@/lib/it-api.js';
import { describeError, toDateInputValue } from '@/lib/it-format.js';

const CATEGORY_VALUES = ['computer', 'monitor', 'network', 'office'] as const;
const STATUS_VALUES = ['in_use', 'idle', 'repairing', 'scrapped'] as const;

interface AssetFormState {
  assetCode: string;
  name: string;
  category: string;
  brandModel: string;
  purchaseDate: string;
  purchaseAmount: string;
  status: string;
  currentHolder: string;
}

const EMPTY_FORM: AssetFormState = {
  assetCode: '',
  name: '',
  category: 'computer',
  brandModel: '',
  purchaseDate: '',
  purchaseAmount: '',
  status: 'idle',
  currentHolder: '',
};

export default function AssetsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useItApi();

  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [assets, setAssets] = useState<readonly ItAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [editor, setEditor] = useState<{ open: boolean; editing?: ItAsset }>({
    open: false,
  });
  const [pendingDelete, setPendingDelete] = useState<number>();
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    api.listAssets({ category, status, search }).then(
      (data) => {
        if (!active) return;
        setAssets(data);
        setLoadError(undefined);
        setLoading(false);
      },
      (cause: unknown) => {
        if (!active) return;
        setLoadError(describeError(t, cause));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [api, category, status, search, t, version]);

  const categoryOptions: readonly EnumOption[] = useMemo(
    () => [
      { value: '', label: t('it.common.allCategories') },
      ...CATEGORY_VALUES.map((value) => ({
        value,
        label: t(`it.categories.${value}`),
      })),
    ],
    [t],
  );
  const statusOptions: readonly EnumOption[] = useMemo(
    () => [
      { value: '', label: t('it.common.allStatuses') },
      ...STATUS_VALUES.map((value) => ({
        value,
        label: t(`it.assetStatus.${value}`),
      })),
    ],
    [t],
  );

  const remove = async (id: number) => {
    try {
      await api.deleteAsset(id);
      setPendingDelete(undefined);
      reload();
    } catch (cause) {
      setLoadError(describeError(t, cause));
      setPendingDelete(undefined);
    }
  };

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-8'>
      <PageHeader
        title={t('it.assets.title')}
        description={t('it.assets.description')}
        actions={
          <>
            <Button variant='outline' size='sm' onClick={reload}>
              <RefreshCw className='size-4' />
              {t('it.common.refresh')}
            </Button>
            <Button
              size='sm'
              onClick={() => setEditor({ open: true, editing: undefined })}
            >
              <Plus className='size-4' />
              {t('it.assets.new')}
            </Button>
          </>
        }
      />

      <div className='flex flex-wrap items-end gap-3'>
        <div className='space-y-1'>
          <Label htmlFor='asset-search'>{t('it.common.search')}</Label>
          <div className='relative'>
            <Search className='absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              id='asset-search'
              className='w-56 pl-8'
              value={search}
              placeholder={t('it.assets.searchPlaceholder')}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <div className='space-y-1'>
          <Label htmlFor='asset-category'>{t('it.assets.category')}</Label>
          <EnumSelect
            id='asset-category'
            value={category}
            onValueChange={setCategory}
            options={categoryOptions}
          />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='asset-status-filter'>{t('it.assets.status')}</Label>
          <EnumSelect
            id='asset-status-filter'
            value={status}
            onValueChange={setStatus}
            options={statusOptions}
          />
        </div>
      </div>

      {loadError ? (
        <p role='alert' className='text-sm text-destructive'>
          {loadError}
        </p>
      ) : null}

      <div className='rounded-xl border border-border bg-card'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('it.assets.code')}</TableHead>
              <TableHead>{t('it.assets.name')}</TableHead>
              <TableHead>{t('it.assets.category')}</TableHead>
              <TableHead>{t('it.assets.status')}</TableHead>
              <TableHead>{t('it.assets.holder')}</TableHead>
              <TableHead>{t('it.assets.attachments')}</TableHead>
              <TableHead className='text-right'>
                {t('it.common.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && assets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Loading label={t('it.common.loading')} />
                </TableCell>
              </TableRow>
            ) : assets.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className='text-center text-muted-foreground'
                >
                  {t('it.assets.empty')}
                </TableCell>
              </TableRow>
            ) : (
              assets.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className='font-mono text-xs'>
                    {asset.assetCode}
                  </TableCell>
                  <TableCell>
                    <div className='font-medium'>{asset.name}</div>
                    <div className='text-xs text-muted-foreground'>
                      {asset.brandModel ?? '—'}
                    </div>
                  </TableCell>
                  <TableCell>{t(`it.categories.${asset.category}`)}</TableCell>
                  <TableCell>
                    <StatusBadge kind='assetStatus' value={asset.status} />
                  </TableCell>
                  <TableCell>{asset.currentHolder ?? '—'}</TableCell>
                  <TableCell>{asset.files.length}</TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-1'>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() =>
                          setEditor({ open: true, editing: asset })
                        }
                      >
                        <Pencil className='size-4' />
                        {t('it.common.edit')}
                      </Button>
                      {pendingDelete === asset.id ? (
                        <>
                          <Button
                            variant='destructive'
                            size='sm'
                            onClick={() => void remove(asset.id)}
                          >
                            {t('it.common.confirm')}
                          </Button>
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={() => setPendingDelete(undefined)}
                          >
                            {t('it.common.cancel')}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() => setPendingDelete(asset.id)}
                        >
                          <Trash2 className='size-4' />
                          {t('it.common.delete')}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {editor.open ? (
        <AssetEditor
          key={editor.editing ? `asset-${editor.editing.id}` : 'asset-new'}
          editing={editor.editing}
          onClose={() => setEditor({ open: false })}
          onSaved={() => {
            setEditor({ open: false });
            reload();
          }}
        />
      ) : null}
    </section>
  );
}

function AssetEditor({
  editing,
  onClose,
  onSaved,
}: {
  readonly editing?: ItAsset;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useItApi();
  const [form, setForm] = useState<AssetFormState>(() =>
    editing
      ? {
          assetCode: editing.assetCode,
          name: editing.name,
          category: editing.category,
          brandModel: editing.brandModel ?? '',
          purchaseDate: toDateInputValue(editing.purchaseDate),
          purchaseAmount:
            editing.purchaseAmount === null
              ? ''
              : String(editing.purchaseAmount),
          status: editing.status,
          currentHolder: editing.currentHolder ?? '',
        }
      : EMPTY_FORM,
  );
  const [files, setFiles] = useState<readonly ItFile[]>(
    () => editing?.files ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const update = (patch: Partial<AssetFormState>) =>
    setForm((current) => ({ ...current, ...patch }));

  const save = async () => {
    setSaving(true);
    setError(undefined);
    const input: AssetInput = {
      assetCode: form.assetCode.trim(),
      name: form.name.trim(),
      category: form.category,
      brandModel: form.brandModel.trim() || null,
      purchaseDate: form.purchaseDate || null,
      purchaseAmount:
        form.purchaseAmount.trim() === '' ? null : Number(form.purchaseAmount),
      status: form.status,
      currentHolder: form.currentHolder.trim() || null,
      fileIds: files.map((file) => file.id),
    };
    try {
      if (editing) {
        await api.updateAsset(editing.id, input);
      } else {
        await api.createAsset(input);
      }
      onSaved();
    } catch (cause) {
      setError(describeError(t, cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {editing ? t('it.assets.editTitle') : t('it.assets.newTitle')}
          </DialogTitle>
          <DialogDescription>{t('it.assets.formHint')}</DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-1'>
            <Label htmlFor='asset-code'>{t('it.assets.code')}</Label>
            <Input
              id='asset-code'
              value={form.assetCode}
              onChange={(event) => update({ assetCode: event.target.value })}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='asset-name'>{t('it.assets.name')}</Label>
            <Input
              id='asset-name'
              value={form.name}
              onChange={(event) => update({ name: event.target.value })}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='asset-category-field'>
              {t('it.assets.category')}
            </Label>
            <EnumSelect
              id='asset-category-field'
              className='w-full'
              value={form.category}
              onValueChange={(value) => update({ category: value })}
              options={CATEGORY_VALUES.map((value) => ({
                value,
                label: t(`it.categories.${value}`),
              }))}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='asset-status-field'>{t('it.assets.status')}</Label>
            <EnumSelect
              id='asset-status-field'
              className='w-full'
              value={form.status}
              onValueChange={(value) => update({ status: value })}
              options={STATUS_VALUES.map((value) => ({
                value,
                label: t(`it.assetStatus.${value}`),
              }))}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='asset-brand'>{t('it.assets.brandModel')}</Label>
            <Input
              id='asset-brand'
              value={form.brandModel}
              onChange={(event) => update({ brandModel: event.target.value })}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='asset-holder'>{t('it.assets.holder')}</Label>
            <Input
              id='asset-holder'
              value={form.currentHolder}
              onChange={(event) =>
                update({ currentHolder: event.target.value })
              }
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='asset-purchase-date'>
              {t('it.assets.purchaseDate')}
            </Label>
            <Input
              id='asset-purchase-date'
              type='date'
              value={form.purchaseDate}
              onChange={(event) => update({ purchaseDate: event.target.value })}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='asset-purchase-amount'>
              {t('it.assets.purchaseAmount')}
            </Label>
            <Input
              id='asset-purchase-amount'
              type='number'
              min='0'
              step='0.01'
              value={form.purchaseAmount}
              onChange={(event) =>
                update({ purchaseAmount: event.target.value })
              }
            />
          </div>
          <div className='sm:col-span-2'>
            <AttachmentField
              label={t('it.assets.attachments')}
              value={files}
              onChange={setFiles}
              disabled={saving}
            />
          </div>
        </div>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={saving}>
            {t('it.common.cancel')}
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? t('it.common.saving') : t('it.common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
