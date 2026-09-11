import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  ClipboardList,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { clientFileRepositoryManagerToken } from '@/extensions/nocobase-file-component-ui';
import { ConfirmDialog } from '@/components/equipment/confirm-dialog';
import { EquipmentFormDialog } from '@/components/equipment/equipment-form-dialog';
import { Loading } from '@/components/loading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  equipmentApi,
  type EquipmentRecord,
  type EquipmentSummary,
} from '@/lib/equipment-api';
import {
  describeStatus,
  EQUIPMENT_STATUSES,
  statusBadgeVariant,
} from '@/lib/equipment-options';

export default function EquipmentListPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const fileManager = useService(clientFileRepositoryManagerToken);
  const navigate = useNavigate();

  const repositories = useMemo(
    () =>
      ({
        mainImage: fileManager.repository('equipmentMainImages'),
        document: fileManager.repository('equipmentDocuments'),
      }) as const,
    [fileManager],
  );

  const [rows, setRows] = useState<readonly EquipmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EquipmentRecord>();
  const [editingBusy, setEditingBusy] = useState(false);
  // Bumped on every dialog open so the form dialog remounts with a fresh key and
  // backfills from the record being edited (see EquipmentFormDialog).
  const [formSession, setFormSession] = useState(0);
  const [deleting, setDeleting] = useState<EquipmentSummary>();
  const [deleteBusy, setDeleteBusy] = useState(false);

  const reload = async (): Promise<void> => {
    try {
      setRows(await equipmentApi.list(api));
    } catch (caught) {
      setLoadError(
        caught instanceof Error
          ? caught.message
          : t('equipment.list.loadFailed'),
      );
    } finally {
      setLoading(false);
    }
  };

  // Initial load keeps every state update in an async continuation so no
  // setState runs synchronously inside the effect.
  useEffect(() => {
    void (async () => {
      try {
        setRows(await equipmentApi.list(api));
      } catch (caught) {
        setLoadError(
          caught instanceof Error
            ? caught.message
            : t('equipment.list.loadFailed'),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [api, t]);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (statusFilter !== 'all' && row.status !== statusFilter) return false;
        const query = search.trim().toLowerCase();
        if (!query) return true;
        return (
          row.deviceNo.toLowerCase().includes(query) ||
          row.name.toLowerCase().includes(query) ||
          row.location.toLowerCase().includes(query)
        );
      }),
    [rows, search, statusFilter],
  );

  const openCreate = (): void => {
    setFormSession((session) => session + 1);
    setEditing(undefined);
    setFormOpen(true);
  };

  const openEdit = async (row: EquipmentSummary): Promise<void> => {
    setEditingBusy(true);
    try {
      setFormSession((session) => session + 1);
      setEditing(await equipmentApi.get(api, row.id));
      setFormOpen(true);
    } catch (caught) {
      setLoadError(
        caught instanceof Error
          ? caught.message
          : t('equipment.list.loadFailed'),
      );
    } finally {
      setEditingBusy(false);
    }
  };

  const confirmDelete = async (): Promise<void> => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await equipmentApi.remove(api, deleting.id);
      setDeleting(undefined);
      await reload();
    } catch (caught) {
      setLoadError(
        caught instanceof Error
          ? caught.message
          : t('equipment.list.deleteFailed'),
      );
      setDeleting(undefined);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-10'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {t('equipment.list.title')}
          </h1>
          <p className='text-muted-foreground'>
            {t('equipment.list.subtitle')}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button type='button' onClick={() => void openCreate()}>
            <Plus aria-hidden='true' />
            {t('equipment.list.new')}
          </Button>
        </div>
      </div>

      <div className='flex flex-wrap items-center gap-3'>
        <div className='relative min-w-56 flex-1'>
          <Search
            className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground'
            aria-hidden='true'
          />
          <Input
            className='pl-8'
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder={t('equipment.list.searchPlaceholder')}
            aria-label={t('equipment.list.searchPlaceholder')}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(next) => setStatusFilter(next ?? 'all')}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('equipment.list.allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>
              {t('equipment.list.allStatuses')}
            </SelectItem>
            {EQUIPMENT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {describeStatus(status, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Loading label={t('equipment.list.loading')} />
      ) : loadError ? (
        <p role='alert' className='text-sm text-destructive'>
          {loadError}
        </p>
      ) : filtered.length === 0 ? (
        <div className='rounded-lg border border-dashed p-12 text-center text-muted-foreground'>
          <Wrench className='mx-auto mb-3 size-8' aria-hidden='true' />
          <p>{t('equipment.list.empty')}</p>
        </div>
      ) : (
        <div className='overflow-hidden rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('equipment.fields.deviceNo')}</TableHead>
                <TableHead>{t('equipment.fields.name')}</TableHead>
                <TableHead>{t('equipment.fields.location')}</TableHead>
                <TableHead>{t('equipment.fields.status')}</TableHead>
                <TableHead>{t('equipment.fields.owner')}</TableHead>
                <TableHead className='text-right'>
                  {t('equipment.list.counts')}
                </TableHead>
                <TableHead className='text-right'>
                  {t('equipment.list.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow
                  key={row.id}
                  className='cursor-pointer'
                  onClick={() => void navigate(`/equipment/${row.id}`)}
                >
                  <TableCell>
                    <div className='flex items-center gap-3'>
                      {row.mainImage ? (
                        <img
                          src={row.mainImage.contentUrl}
                          alt={row.name}
                          className='h-10 w-10 rounded-md object-cover'
                        />
                      ) : (
                        <span className='flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground'>
                          <Wrench className='size-4' aria-hidden='true' />
                        </span>
                      )}
                      <span className='font-medium'>{row.deviceNo}</span>
                    </div>
                  </TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.location}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(row.status)}>
                      {describeStatus(row.status, t)}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.owner ?? '-'}</TableCell>
                  <TableCell className='text-right text-muted-foreground'>
                    {t('equipment.list.documentsCount', {
                      count: row.documentCount,
                    })}
                    {' · '}
                    {t('equipment.list.inspectionsCount', {
                      count: row.inspectionCount,
                    })}
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex items-center justify-end gap-1'>
                      <Button
                        type='button'
                        size='icon'
                        variant='ghost'
                        aria-label={t('equipment.list.view')}
                        title={t('equipment.list.view')}
                        onClick={(event) => {
                          event.stopPropagation();
                          void navigate(`/equipment/${row.id}`);
                        }}
                      >
                        <ClipboardList aria-hidden='true' />
                      </Button>
                      <Button
                        type='button'
                        size='icon'
                        variant='ghost'
                        aria-label={t('equipment.list.edit')}
                        title={t('equipment.list.edit')}
                        disabled={editingBusy}
                        onClick={(event) => {
                          event.stopPropagation();
                          void openEdit(row);
                        }}
                      >
                        <Pencil aria-hidden='true' />
                      </Button>
                      <Button
                        type='button'
                        size='icon'
                        variant='ghost'
                        aria-label={t('equipment.list.delete')}
                        title={t('equipment.list.delete')}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleting(row);
                        }}
                      >
                        <Trash2 aria-hidden='true' />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EquipmentFormDialog
        key={formSession}
        open={formOpen}
        onOpenChange={setFormOpen}
        equipment={editing}
        api={api}
        mainImageRepository={repositories.mainImage}
        documentRepository={repositories.document}
        onSaved={() => void reload()}
      />

      <ConfirmDialog
        open={deleting !== undefined}
        onOpenChange={(next) => {
          if (!next) setDeleting(undefined);
        }}
        title={t('equipment.deleteDialog.title')}
        description={
          deleting
            ? t('equipment.deleteDialog.description', {
                deviceNo: deleting.deviceNo,
              })
            : undefined
        }
        confirmLabel={t('equipment.deleteDialog.confirm')}
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
}
