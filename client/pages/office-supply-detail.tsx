import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Loading } from '@/components/loading';
import { OfficeSupplyFormDialog } from '@/components/office-supply-form-dialog';
import { OfficeSupplyRequisitionDialog } from '@/components/office-supply-requisition-dialog';
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
import { formatDateTime } from '@/lib/format';
import {
  errorCode,
  OfficeSuppliesClient,
  type OfficeSupplyInput,
  type RequisitionResult,
  type SupplyDetail,
  type SupplyRequisitionInput,
} from '@/lib/office-supplies';

const LOW_STOCK_THRESHOLD = 5;

export default function OfficeSupplyDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { id } = useParams();
  const supplyId = Number(id);
  const api = useService(apiClientToken);
  const client = useMemo(() => new OfficeSuppliesClient(api), [api]);

  const [detail, setDetail] = useState<SupplyDetail | null>(null);
  const invalidId = !Number.isInteger(supplyId) || supplyId <= 0;
  const [loading, setLoading] = useState(!invalidId);
  const [loadError, setLoadError] = useState(false);
  const [notFound, setNotFound] = useState(invalidId);

  const [requisitionOpen, setRequisitionOpen] = useState(false);
  const [requisitionPending, setRequisitionPending] = useState(false);
  const [requisitionError, setRequisitionError] = useState<string | null>(null);
  const [recentResult, setRecentResult] = useState<RequisitionResult | null>(
    null,
  );

  const [editing, setEditing] = useState(false);
  const [formPending, setFormPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    if (!Number.isInteger(supplyId) || supplyId <= 0) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    setNotFound(false);
    try {
      const next = await client.get(supplyId);
      setDetail(next);
    } catch (error: unknown) {
      if (errorCode(error) === 'SUPPLY_NOT_FOUND') {
        setNotFound(true);
      } else {
        setLoadError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [client, supplyId]);

  useEffect(() => {
    if (invalidId) return;
    let active = true;
    client.get(supplyId).then(
      (next) => {
        if (active) {
          setDetail(next);
          setLoading(false);
        }
      },
      (error: unknown) => {
        if (!active) return;
        if (errorCode(error) === 'SUPPLY_NOT_FOUND') {
          setNotFound(true);
        } else {
          setLoadError(true);
        }
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [client, invalidId, supplyId]);

  async function handleRequisition(
    input: SupplyRequisitionInput,
  ): Promise<void> {
    setRequisitionPending(true);
    setRequisitionError(null);
    try {
      const result = await client.requisition(supplyId, input);
      setRequisitionOpen(false);
      setRecentResult(result);
      // refresh so the requisition list and stock badge agree with the server
      await reload();
    } catch (error: unknown) {
      setRequisitionError(translateError(error));
    } finally {
      setRequisitionPending(false);
    }
  }

  async function handleUpdate(input: OfficeSupplyInput): Promise<void> {
    setFormPending(true);
    setFormError(null);
    try {
      await client.update(supplyId, input);
      setEditing(false);
      await reload();
    } catch (error: unknown) {
      setFormError(translateError(error));
    } finally {
      setFormPending(false);
    }
  }

  const navigate = useNavigate();

  async function handleDelete(): Promise<void> {
    setDeletePending(true);
    setDeleteError(null);
    try {
      await client.remove(supplyId);
      setDeleting(false);
      void navigate('..');
    } catch (error: unknown) {
      setDeleteError(translateError(error));
      setDeleting(false);
    } finally {
      setDeletePending(false);
    }
  }

  const supply = detail?.supply ?? null;
  const requisitions = detail?.requisitions ?? [];
  const stockEmpty = supply !== null && supply.quantity === 0;
  const stockLow =
    supply !== null &&
    supply.quantity > 0 &&
    supply.quantity <= LOW_STOCK_THRESHOLD;

  return (
    <section className='mx-auto w-full max-w-6xl p-6'>
      <div className='flex items-center gap-2 text-sm'>
        <NavLink
          to='..'
          className='inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground'
        >
          ← {t('officeSupplies.back')}
        </NavLink>
      </div>

      {loading ? (
        <Loading className='min-h-64' label={t('officeSupplies.loading')} />
      ) : notFound || invalidId ? (
        <Card className='mt-6'>
          <CardContent className='py-10 text-center text-sm text-muted-foreground'>
            {t('officeSupplies.notFound')}
          </CardContent>
        </Card>
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
      ) : supply === null ? null : (
        <>
          <div className='mt-4 flex items-start justify-between gap-4'>
            <div>
              <h1 className='font-heading text-2xl font-semibold tracking-tight'>
                {supply.name}
              </h1>
              <div className='mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground'>
                <span className='font-mono text-xs'>{supply.code}</span>
                <span>{supply.category}</span>
                <span className='inline-flex items-center gap-2'>
                  <span
                    className={stockEmpty ? 'text-destructive' : 'font-medium'}
                  >
                    {t('officeSupplies.stock.quantity', {
                      quantity: supply.quantity,
                      unit: supply.unit,
                    })}
                  </span>
                  {stockEmpty && (
                    <Badge variant='destructive'>
                      {t('officeSupplies.stock.outOfStock')}
                    </Badge>
                  )}
                  {stockLow && (
                    <Badge variant='secondary'>
                      {t('officeSupplies.stock.lowStock')}
                    </Badge>
                  )}
                </span>
              </div>
            </div>
            <div className='flex shrink-0 gap-2'>
              <Button
                type='button'
                onClick={() => {
                  setRequisitionError(null);
                  setRequisitionOpen(true);
                }}
                disabled={stockEmpty}
              >
                {t('officeSupplies.requisition')}
              </Button>
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  setFormError(null);
                  setEditing(true);
                }}
              >
                {t('officeSupplies.actions.edit')}
              </Button>
              <Button
                type='button'
                variant='ghost'
                className='text-destructive hover:text-destructive'
                onClick={() => setDeleting(true)}
              >
                {t('officeSupplies.actions.delete')}
              </Button>
            </div>
          </div>

          {recentResult !== null && (
            <Card className='mt-6 border-primary/40'>
              <CardContent className='py-4 text-sm'>
                {t('officeSupplies.requisitionSuccess', {
                  name: supply.name,
                  quantity: recentResult.requisition.quantity,
                  remaining: recentResult.supply.quantity,
                })}
              </CardContent>
            </Card>
          )}

          <div className='mt-6 grid gap-6 lg:grid-cols-[240px_1fr]'>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>
                  {t('officeSupplies.info')}
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4 text-sm'>
                <div>
                  <p className='text-xs text-muted-foreground'>
                    {t('officeSupplies.fields.category')}
                  </p>
                  <p className='mt-0.5'>{supply.category}</p>
                </div>
                <div>
                  <p className='text-xs text-muted-foreground'>
                    {t('officeSupplies.fields.unit')}
                  </p>
                  <p className='mt-0.5'>{supply.unit}</p>
                </div>
                <div>
                  <p className='text-xs text-muted-foreground'>
                    {t('officeSupplies.fields.quantity')}
                  </p>
                  <p className='mt-0.5'>{supply.quantity}</p>
                </div>
                <div>
                  <p className='text-xs text-muted-foreground'>
                    {t('officeSupplies.fields.remark')}
                  </p>
                  <p className='mt-0.5'>{supply.remark ?? '—'}</p>
                </div>
                <div>
                  <p className='text-xs text-muted-foreground'>
                    {t('officeSupplies.fields.createdAt')}
                  </p>
                  <p className='mt-0.5'>{formatDateTime(supply.createdAt)}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='text-base'>
                  {t('officeSupplies.requisitionRecords', {
                    count: requisitions.length,
                  })}
                </CardTitle>
                <CardDescription>
                  {t('officeSupplies.requisitionRecordsHint')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {requisitions.length === 0 ? (
                  <p className='py-8 text-center text-sm text-muted-foreground'>
                    {t('officeSupplies.noRequisitions')}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          {t('officeSupplies.columns.time')}
                        </TableHead>
                        <TableHead>
                          {t('officeSupplies.columns.requisitioner')}
                        </TableHead>
                        <TableHead>
                          {t('officeSupplies.columns.quantity')}
                        </TableHead>
                        <TableHead>
                          {t('officeSupplies.columns.remark')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requisitions.map((requisition) => (
                        <TableRow key={requisition.id}>
                          <TableCell className='whitespace-nowrap'>
                            {formatDateTime(requisition.requisitionedAt)}
                          </TableCell>
                          <TableCell className='font-medium'>
                            {requisition.requisitioner}
                          </TableCell>
                          <TableCell>
                            {requisition.quantity}&nbsp;{supply.unit}
                          </TableCell>
                          <TableCell className='max-w-56 truncate text-muted-foreground'>
                            {requisition.remark ?? '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {supply !== null && requisitionOpen && (
        <OfficeSupplyRequisitionDialog
          open
          onOpenChange={setRequisitionOpen}
          supplyName={supply.name}
          availableQuantity={supply.quantity}
          unit={supply.unit}
          pending={requisitionPending}
          error={requisitionError}
          onSubmit={handleRequisition}
        />
      )}
      {supply !== null && editing && (
        <OfficeSupplyFormDialog
          open
          onOpenChange={(open) => {
            if (!open) setEditing(false);
          }}
          supply={supply}
          pending={formPending}
          error={formError}
          onSubmit={handleUpdate}
        />
      )}
      {supply !== null && deleting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleting(false);
          }}
          title={t('officeSupplies.deleteTitle', { name: supply.name })}
          description={t('officeSupplies.deleteDescription')}
          confirmLabel={t('officeSupplies.actions.delete')}
          danger
          pending={deletePending}
          onConfirm={() => void handleDelete()}
        />
      )}

      {deleteError !== null && (
        <p className='mt-4 text-sm text-destructive'>{deleteError}</p>
      )}
    </section>
  );
}
