import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  matchPath,
  NavLink,
  Outlet,
  useLocation,
  useResolvedPath,
} from 'react-router';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Loading } from '@/components/loading';
import { OfficeSupplyFormDialog } from '@/components/office-supply-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  errorCode,
  OfficeSuppliesClient,
  type OfficeSupply,
  type OfficeSupplyInput,
} from '@/lib/office-supplies';

const LOW_STOCK_THRESHOLD = 5;

export default function OfficeSuppliesListPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const client = useMemo(() => new OfficeSuppliesClient(api), [api]);

  const location = useLocation();
  const parentPath = useResolvedPath('.');
  const isParentEntry = matchPath(
    { path: parentPath.pathname, end: true },
    location.pathname,
  );

  const [supplies, setSupplies] = useState<readonly OfficeSupply[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<OfficeSupply | null>(null);
  const [deleting, setDeleting] = useState<OfficeSupply | null>(null);
  const [formPending, setFormPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const translateError = useCallback(
    (error: unknown): string => {
      const code = errorCode(error);
      return t(`officeSupplies.errors.${code}`, {
        defaultValue: t('officeSupplies.errors.UNKNOWN'),
      });
    },
    [t],
  );

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(false);
    try {
      setSupplies(await client.list());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    let active = true;
    client.list().then(
      (rows) => {
        if (active) {
          setSupplies(rows);
          setLoading(false);
        }
      },
      () => {
        if (active) {
          setLoadError(true);
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [client]);

  // The detail child route renders here instead of the table.
  if (!isParentEntry) {
    return <Outlet />;
  }

  async function handleCreate(input: OfficeSupplyInput): Promise<void> {
    setFormPending(true);
    setFormError(null);
    try {
      await client.create(input);
      setCreateOpen(false);
      await reload();
    } catch (error: unknown) {
      setFormError(translateError(error));
    } finally {
      setFormPending(false);
    }
  }

  async function handleUpdate(input: OfficeSupplyInput): Promise<void> {
    if (editing === null) return;
    setFormPending(true);
    setFormError(null);
    try {
      await client.update(editing.id, input);
      setEditing(null);
      await reload();
    } catch (error: unknown) {
      setFormError(translateError(error));
    } finally {
      setFormPending(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (deleting === null) return;
    setDeletePending(true);
    try {
      await client.remove(deleting.id);
      setDeleting(null);
      await reload();
    } catch {
      setDeleting(null);
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <section className='mx-auto w-full max-w-6xl p-6'>
      <div className='flex items-start justify-between gap-4'>
        <div>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {t('officeSupplies.title')}
          </h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            {t('officeSupplies.description')}
          </p>
        </div>
        <Button
          type='button'
          onClick={() => {
            setFormError(null);
            setCreateOpen(true);
          }}
        >
          <Plus aria-hidden='true' />
          {t('officeSupplies.addSupply')}
        </Button>
      </div>

      {loading ? (
        <Loading className='min-h-64' label={t('officeSupplies.loading')} />
      ) : loadError ? (
        <Card className='mt-6'>
          <CardContent className='flex flex-col items-center gap-3 py-10 text-center'>
            <p className='text-sm text-muted-foreground'>
              {t('officeSupplies.loadFailed')}
            </p>
            <Button
              type='button'
              variant='outline'
              onClick={() => void reload()}
            >
              {t('officeSupplies.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : supplies.length === 0 ? (
        <Card className='mt-6'>
          <CardContent className='py-10 text-center text-sm text-muted-foreground'>
            {t('officeSupplies.empty')}
          </CardContent>
        </Card>
      ) : (
        <Card className='mt-6'>
          <CardHeader>
            <CardTitle>{t('officeSupplies.inventory')}</CardTitle>
            <CardDescription>
              {t('officeSupplies.inventoryHint')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('officeSupplies.columns.code')}</TableHead>
                  <TableHead>{t('officeSupplies.columns.name')}</TableHead>
                  <TableHead>{t('officeSupplies.columns.category')}</TableHead>
                  <TableHead>{t('officeSupplies.columns.quantity')}</TableHead>
                  <TableHead>{t('officeSupplies.columns.remark')}</TableHead>
                  <TableHead className='text-right'>
                    {t('officeSupplies.columns.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplies.map((supply) => (
                  <TableRow key={supply.id}>
                    <TableCell className='font-mono text-xs'>
                      {supply.code}
                    </TableCell>
                    <TableCell className='font-medium'>{supply.name}</TableCell>
                    <TableCell className='text-muted-foreground'>
                      {supply.category}
                    </TableCell>
                    <TableCell>
                      <span className='inline-flex items-center gap-2'>
                        <span
                          className={
                            supply.quantity === 0 ? 'text-destructive' : ''
                          }
                        >
                          {supply.quantity}&nbsp;{supply.unit}
                        </span>
                        {supply.quantity <= LOW_STOCK_THRESHOLD && (
                          <Badge
                            variant={
                              supply.quantity === 0
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {supply.quantity === 0
                              ? t('officeSupplies.stock.outOfStock')
                              : t('officeSupplies.stock.lowStock')}
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className='max-w-56 truncate text-muted-foreground'>
                      {supply.remark ?? '—'}
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='inline-flex gap-1'>
                        <Button
                          variant='ghost'
                          size='sm'
                          render={<NavLink to={String(supply.id)} />}
                        >
                          {t('officeSupplies.actions.view')}
                        </Button>
                        <Button
                          variant='ghost'
                          size='sm'
                          type='button'
                          onClick={() => {
                            setFormError(null);
                            setEditing(supply);
                          }}
                        >
                          {t('officeSupplies.actions.edit')}
                        </Button>
                        <Button
                          variant='ghost'
                          size='sm'
                          type='button'
                          className='text-destructive hover:text-destructive'
                          onClick={() => setDeleting(supply)}
                        >
                          {t('officeSupplies.actions.delete')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {createOpen && (
        <OfficeSupplyFormDialog
          open
          onOpenChange={setCreateOpen}
          pending={formPending}
          error={formError}
          onSubmit={handleCreate}
        />
      )}
      {editing !== null && (
        <OfficeSupplyFormDialog
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          supply={editing}
          pending={formPending}
          error={formError}
          onSubmit={handleUpdate}
        />
      )}
      {deleting !== null && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
          title={t('officeSupplies.deleteTitle', { name: deleting.name })}
          description={t('officeSupplies.deleteDescription')}
          confirmLabel={t('officeSupplies.actions.delete')}
          danger
          pending={deletePending}
          onConfirm={() => void handleDelete()}
        />
      )}
    </section>
  );
}
