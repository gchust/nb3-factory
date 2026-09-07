import { appApiClientToken, useService } from '@nocobase/app-client';
import { useGetIdentity } from '@refinedev/core';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  EyeIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  claimAsset,
  createAsset,
  deleteAsset,
  listAssets,
  listEmployees,
  returnAsset,
  updateAsset,
} from '../components/asset/asset-api.js';
import {
  assetStatusKey,
  assetTypeKey,
  formatDateTime,
} from '../components/asset/asset-label-utils.js';
import { AssetStatusBadge } from '../components/asset/asset-labels.js';
import {
  ASSET_STATUSES,
  ASSET_TYPES,
  type Asset,
  type AssetInput,
  type Employee,
} from '../components/asset/asset-types.js';
import { AssetFormDialog } from '../components/asset/asset-form-dialog.js';
import {
  ClaimDialog,
  DeleteDialog,
  ReturnDialog,
} from '../components/asset/asset-action-dialogs.js';

interface AppIdentity {
  email?: string;
}

export default function AssetsPage(): ReactElement {
  const { t } = useTranslation();
  const appClient = useService(appApiClientToken);
  const { data: identity } = useGetIdentity<AppIdentity>();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [claiming, setClaiming] = useState<Asset | null>(null);
  const [returning, setReturning] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = useMemo(() => {
    const email = identity?.email;
    if (!email) {
      return false;
    }
    return employees.some(
      (employee) => employee.email === email && employee.isAdmin,
    );
  }, [employees, identity?.email]);

  const loadAssets = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAssets(appClient, {
        type: type || undefined,
        status: status || undefined,
        search: search.trim() || undefined,
      });
      setAssets(data);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('assets.loadError'),
      );
    } finally {
      setLoading(false);
    }
  }, [appClient, search, status, type, t]);

  useEffect(() => {
    void listEmployees(appClient)
      .then(setEmployees)
      .catch(() => {
        // The employee list only drives the admin flag and the claim dialog;
        // a failure should not block the asset list itself.
      });
  }, [appClient]);

  // Debounce the search input so each keystroke does not fire a request.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAssets();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadAssets]);

  function refresh(): void {
    void loadAssets();
  }

  async function handleCreate(input: AssetInput): Promise<void> {
    setSubmitting(true);
    try {
      await createAsset(appClient, input);
      toast.success(t('assets.created'));
      setFormOpen(false);
      refresh();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : t('assets.saveError'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(input: AssetInput): Promise<void> {
    if (!editing) {
      return;
    }
    setSubmitting(true);
    try {
      await updateAsset(appClient, editing.id, input);
      toast.success(t('assets.updated'));
      setFormOpen(false);
      setEditing(null);
      refresh();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : t('assets.saveError'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClaim(
    employeeId: number,
    remark: string | null,
  ): Promise<void> {
    if (!claiming) {
      return;
    }
    setSubmitting(true);
    try {
      await claimAsset(appClient, claiming.id, employeeId, remark);
      toast.success(t('assets.claimed'));
      setClaiming(null);
      refresh();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : t('assets.claimError'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReturn(remark: string | null): Promise<void> {
    if (!returning) {
      return;
    }
    setSubmitting(true);
    try {
      await returnAsset(appClient, returning.id, remark);
      toast.success(t('assets.returned'));
      setReturning(null);
      refresh();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : t('assets.returnError'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleting) {
      return;
    }
    setSubmitting(true);
    try {
      await deleteAsset(appClient, deleting.id);
      toast.success(t('assets.deleted'));
      setDeleting(null);
      refresh();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : t('assets.deleteError'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-8'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {t('assets.listTitle')}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {t('assets.listDescription')}
          </p>
        </div>
        {isAdmin ? (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <PlusIcon />
            {t('assets.create')}
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader className='gap-3'>
          <CardTitle className='text-base'>{t('assets.filters')}</CardTitle>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='relative w-full max-w-64'>
              <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                className='pl-8'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('assets.searchPlaceholder')}
              />
            </div>
            <Select
              value={type}
              onValueChange={(value) => setType(value ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('assets.allTypes')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=''>{t('assets.allTypes')}</SelectItem>
                {ASSET_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(assetTypeKey(value))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('assets.allStatuses')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=''>{t('assets.allStatuses')}</SelectItem>
                {ASSET_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(assetStatusKey(value))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
          {loading ? (
            <div className='flex justify-center py-10'>
              <Spinner className='size-6' />
            </div>
          ) : assets.length === 0 ? (
            <p className='py-10 text-center text-sm text-muted-foreground'>
              {t('assets.empty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('assets.columns.assetNumber')}</TableHead>
                  <TableHead>{t('assets.columns.name')}</TableHead>
                  <TableHead>{t('assets.columns.type')}</TableHead>
                  <TableHead>{t('assets.columns.brandModel')}</TableHead>
                  <TableHead>{t('assets.columns.status')}</TableHead>
                  <TableHead>{t('assets.columns.currentUser')}</TableHead>
                  <TableHead>{t('assets.columns.purchasedAt')}</TableHead>
                  <TableHead className='text-right'>
                    {t('assets.columns.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className='font-medium'>
                      <Link
                        className='text-primary hover:underline'
                        to={`/it-assets/${asset.id}`}
                      >
                        {asset.assetNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{asset.name}</TableCell>
                    <TableCell>{t(assetTypeKey(asset.type))}</TableCell>
                    <TableCell>{asset.brandModel}</TableCell>
                    <TableCell>
                      <AssetStatusBadge
                        status={asset.status}
                        label={t(assetStatusKey(asset.status))}
                      />
                    </TableCell>
                    <TableCell>{asset.currentEmployeeName ?? '—'}</TableCell>
                    <TableCell>{formatDateTime(asset.purchasedAt)}</TableCell>
                    <TableCell>
                      <div className='flex items-center justify-end gap-1'>
                        <Button
                          size='icon-sm'
                          variant='ghost'
                          nativeButton={false}
                          render={
                            <Link
                              to={`/it-assets/${asset.id}`}
                              aria-label={t('assets.detail')}
                            />
                          }
                        >
                          <EyeIcon />
                        </Button>
                        {asset.status === 'available' ? (
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() => setClaiming(asset)}
                          >
                            {t('assets.claim')}
                          </Button>
                        ) : null}
                        {asset.status === 'inUse' ? (
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() => setReturning(asset)}
                          >
                            {t('assets.return')}
                          </Button>
                        ) : null}
                        {isAdmin ? (
                          <>
                            <Button
                              size='icon-sm'
                              variant='ghost'
                              aria-label={t('assets.edit')}
                              onClick={() => {
                                setEditing(asset);
                                setFormOpen(true);
                              }}
                            >
                              <PencilIcon />
                            </Button>
                            <Button
                              size='icon-sm'
                              variant='ghost'
                              aria-label={t('assets.delete')}
                              onClick={() => setDeleting(asset)}
                            >
                              <Trash2Icon />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AssetFormDialog
        open={formOpen}
        asset={editing}
        submitting={submitting}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditing(null);
          }
        }}
        onSubmit={editing ? handleUpdate : handleCreate}
      />
      <ClaimDialog
        open={claiming !== null}
        asset={claiming}
        employees={employees}
        submitting={submitting}
        onOpenChange={(open) => {
          if (!open) {
            setClaiming(null);
          }
        }}
        onSubmit={handleClaim}
      />
      <ReturnDialog
        open={returning !== null}
        asset={returning}
        submitting={submitting}
        onOpenChange={(open) => {
          if (!open) {
            setReturning(null);
          }
        }}
        onSubmit={handleReturn}
      />
      <DeleteDialog
        open={deleting !== null}
        asset={deleting}
        submitting={submitting}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
          }
        }}
        onConfirm={handleDelete}
      />
    </section>
  );
}
