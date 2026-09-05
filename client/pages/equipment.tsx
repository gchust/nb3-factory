import { useTranslation } from '@nocobase/i18n/client';
import { Loader2, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { toast } from 'sonner';

import { describeError, useAppApiClient } from '@/components/equipment/api.js';
import { BorrowDialog } from '@/components/equipment/borrow-dialog.js';
import { EquipmentFormDialog } from '@/components/equipment/equipment-form-dialog.js';
import { EquipmentStatusBadge } from '@/components/equipment/equipment-status-badge.js';
import type {
  BorrowCreatePayload,
  EquipmentCreatePayload,
  EquipmentListItem,
  EquipmentUpdatePayload,
} from '@/components/equipment/types.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function EquipmentPage(): ReactElement {
  const { t } = useTranslation();
  const appClient = useAppApiClient();
  const [items, setItems] = useState<EquipmentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EquipmentListItem | null>(null);
  const [borrowing, setBorrowing] = useState<EquipmentListItem | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await appClient.request<{ data: EquipmentListItem[] }>(
        'equipment',
      );
      setItems(payload.data);
    } catch (caught) {
      setError(describeError(caught).message);
    } finally {
      setIsLoading(false);
    }
  }, [appClient]);

  useEffect(() => {
    let active = true;
    void (async (): Promise<void> => {
      try {
        const payload = await appClient.request<{
          data: EquipmentListItem[];
        }>('equipment');
        if (active) setItems(payload.data);
      } catch (caught) {
        if (active) setError(describeError(caught).message);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [appClient]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(items.map((item) => item.category).filter(Boolean)),
      ).sort(),
    [items],
  );

  // The ledger carries a per-row `canMaintain` flag; maintain actions (create,
  // edit, delete) are manager-only, so the create button follows the same
  // signal instead of offering an action the server rejects for employees.
  const canMaintain = items.some((item) => item.canMaintain);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return items;
    }
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        item.assetNumber.toLowerCase().includes(needle) ||
        item.category.toLowerCase().includes(needle),
    );
  }, [items, search]);

  const createEquipment = async (
    raw: EquipmentCreatePayload | EquipmentUpdatePayload,
  ): Promise<void> => {
    const payload = raw as EquipmentCreatePayload;
    await appClient.request('equipment', {
      body: JSON.stringify(payload),
      method: 'POST',
    });
    toast.success(t('equipment.toasts.created'));
    await reload();
  };

  const updateEquipment = async (
    payload: EquipmentUpdatePayload,
  ): Promise<void> => {
    if (!editing) {
      return;
    }
    await appClient.request(`equipment/${editing.id}`, {
      body: JSON.stringify(payload),
      method: 'PATCH',
    });
    toast.success(t('equipment.toasts.updated'));
    await reload();
  };

  const deleteEquipment = async (item: EquipmentListItem): Promise<void> => {
    if (!window.confirm(t('equipment.actions.confirmDelete'))) {
      return;
    }
    setBusyId(item.id);
    try {
      await appClient.request(`equipment/${item.id}`, { method: 'DELETE' });
      toast.success(t('equipment.toasts.deleted'));
      await reload();
    } catch (caught) {
      const failure = describeError(caught);
      toast.error(failure.message || t('equipment.errors.deleteFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const borrow = async (payload: BorrowCreatePayload): Promise<void> => {
    await appClient.request('equipment-borrow-records', {
      body: JSON.stringify(payload),
      method: 'POST',
    });
    toast.success(t('equipment.toasts.borrowed'));
    await reload();
  };

  const returnEquipment = async (item: EquipmentListItem): Promise<void> => {
    if (!item.openBorrowRecordId) {
      return;
    }
    setBusyId(item.id);
    try {
      await appClient.request(
        `equipment-borrow-records/${item.openBorrowRecordId}/return`,
        { body: '{}', method: 'POST' },
      );
      toast.success(t('equipment.toasts.returned'));
      await reload();
    } catch (caught) {
      toast.error(
        describeError(caught).message || t('equipment.errors.returnFailed'),
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className='mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6'>
      <Card>
        <CardHeader>
          <CardTitle className='flex flex-wrap items-center justify-between gap-3'>
            <span>{t('equipment.list.title')}</span>
            <div className='flex items-center gap-2'>
              <div className='relative'>
                <Search className='absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  aria-label={t('equipment.list.searchPlaceholder')}
                  className='w-56 pl-8'
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('equipment.list.searchPlaceholder')}
                  value={search}
                />
              </div>
              {canMaintain ? (
                <Button onClick={() => setCreateOpen(true)} size='sm'>
                  <Plus />
                  {t('equipment.list.create')}
                </Button>
              ) : null}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('equipment.fields.assetNumber')}</TableHead>
                <TableHead>{t('equipment.fields.name')}</TableHead>
                <TableHead>{t('equipment.fields.category')}</TableHead>
                <TableHead>{t('equipment.fields.status')}</TableHead>
                <TableHead className='text-right'>
                  {t('equipment.fields.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    className='h-24 text-center text-muted-foreground'
                    colSpan={5}
                  >
                    <Loader2 className='mx-auto animate-spin' />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    className='h-24 text-center text-muted-foreground'
                    colSpan={5}
                  >
                    {t('equipment.list.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className='font-medium'>
                      {item.assetNumber}
                    </TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>
                      <EquipmentStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='flex justify-end gap-1'>
                        {item.canBorrow ? (
                          <Button
                            onClick={() => setBorrowing(item)}
                            size='sm'
                            variant='outline'
                          >
                            {t('equipment.actions.borrow')}
                          </Button>
                        ) : null}
                        {item.canReturn ? (
                          <Button
                            disabled={busyId === item.id}
                            onClick={() => void returnEquipment(item)}
                            size='sm'
                            variant='outline'
                          >
                            <RotateCcw />
                            {t('equipment.actions.return')}
                          </Button>
                        ) : null}
                        {item.canMaintain ? (
                          <>
                            <Button
                              onClick={() => setEditing(item)}
                              size='icon-sm'
                              variant='ghost'
                            >
                              <Pencil />
                              <span className='sr-only'>
                                {t('equipment.actions.edit')}
                              </span>
                            </Button>
                            <Button
                              disabled={busyId === item.id}
                              onClick={() => void deleteEquipment(item)}
                              size='icon-sm'
                              variant='ghost'
                            >
                              <Trash2 />
                              <span className='sr-only'>
                                {t('equipment.actions.delete')}
                              </span>
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EquipmentFormDialog
        categories={categories}
        equipment={null}
        onOpenChange={setCreateOpen}
        onSubmit={createEquipment}
        open={createOpen}
      />
      <EquipmentFormDialog
        categories={categories}
        equipment={editing}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
          }
        }}
        onSubmit={updateEquipment}
        open={editing !== null}
      />
      {borrowing ? (
        <BorrowDialog
          equipment={borrowing}
          onOpenChange={(open) => {
            if (!open) {
              setBorrowing(null);
            }
          }}
          onSubmit={borrow}
          open={borrowing !== null}
        />
      ) : null}
    </div>
  );
}
