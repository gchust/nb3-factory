import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon, RefreshCw } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Outlet, useNavigate } from 'react-router';

import { DataTable, type DataTableColumn } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLabApi } from '@/lib/lab-api';
import { useLabErrorMessage } from '@/lib/lab-errors';
import { equipmentFields, laboratoryChoices } from '@/lib/lab-fields';
import { formatDay } from '@/lib/lab-format';
import { labelFor, optionLabels } from '@/lib/lab-options';
import { canWriteIn, hasStaffRole } from '@/lib/lab-permissions';
import { statusTone } from '@/lib/lab-status';
import { EQUIPMENT_STATUS_OPTIONS, type EquipmentView } from '@/lib/lab-types';
import { useAsync } from '@/lib/use-async';

export default function EquipmentPage(): ReactElement {
  const { t } = useTranslation();
  const api = useLabApi();
  const navigate = useNavigate();
  const [labFilter, setLabFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EquipmentView | null>(null);

  const access = useAsync('access', () => api.access());
  const laboratories = useAsync('laboratories', () => api.laboratories());
  const list = useAsync(`equipment:${labFilter}:${statusFilter}`, () =>
    api.equipment({ labId: labFilter, status: statusFilter }),
  );
  const message = useLabErrorMessage(list.error);

  const laboratoryOptions = laboratoryChoices(laboratories.data ?? []);
  const mayCreate = hasStaffRole(access.data, ['lab_admin']);
  const canManage = (equipment: EquipmentView): boolean =>
    canWriteIn(access.data, equipment.labId, ['lab_admin']);

  const columns: DataTableColumn<EquipmentView>[] = [
    {
      key: 'assetNo',
      headerKey: 'lab.assetNo',
      text: (row) => row.assetNo,
      className: 'font-medium',
    },
    { key: 'name', headerKey: 'lab.name', text: (row) => row.name },
    {
      key: 'laboratory',
      headerKey: 'lab.laboratory',
      text: (row) => row.labName ?? '',
    },
    {
      key: 'status',
      headerKey: 'lab.status',
      text: (row) => row.status,
      render: (row) => (
        <Badge variant={statusTone(row.status)}>
          {labelFor(EQUIPMENT_STATUS_OPTIONS, row.status, t)}
        </Badge>
      ),
    },
    {
      key: 'calibration',
      headerKey: 'lab.calibration',
      text: (row) => row.calibrationExpiresAt ?? '',
      render: (row) => (
        <Badge
          variant={
            row.calibrationExpired
              ? 'destructive'
              : row.calibrationExpiringSoon
                ? 'secondary'
                : 'default'
          }
        >
          {row.calibrationExpiresAt
            ? row.calibrationExpired
              ? t('lab.calibrationExpiredOn', {
                  date: formatDay(t, row.calibrationExpiresAt),
                })
              : t('lab.calibrationDueOn', {
                  date: formatDay(t, row.calibrationExpiresAt),
                })
            : t('lab.calibrationMissing')}
        </Badge>
      ),
    },
    {
      key: 'blockingIssues',
      headerKey: 'lab.blockingIssues',
      className: 'text-right tabular-nums',
      text: (row) => String(row.openBlockingIssues),
      render: (row) =>
        row.openBlockingIssues > 0 ? (
          <Badge variant='destructive'>{row.openBlockingIssues}</Badge>
        ) : (
          <span className='text-muted-foreground'>0</span>
        ),
    },
    {
      key: 'actions',
      headerKey: 'lab.actions',
      className: 'w-44',
      render: (row) => (
        <div className='flex justify-end gap-1'>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => void navigate(`/equipment/${row.id}`)}
          >
            {t('lab.details')}
          </Button>
          {canManage(row) ? (
            <Button
              size='sm'
              variant='outline'
              onClick={(event) => {
                event.stopPropagation();
                setEditing(row);
              }}
            >
              {t('lab.edit')}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        actions={
          <>
            <Button
              variant='outline'
              onClick={list.reload}
              disabled={list.loading}
            >
              <RefreshCw />
              {t('lab.refresh')}
            </Button>
            {mayCreate ? (
              <Button onClick={() => setCreating(true)}>
                <PlusIcon />
                {t('lab.createEquipment')}
              </Button>
            ) : null}
          </>
        }
        description={t('equipment.description')}
        title={t('equipment.title')}
      />

      <div className='flex flex-wrap items-center gap-2'>
        <Select
          items={[
            { value: '', label: t('lab.allLaboratories') },
            ...laboratoryOptions,
          ]}
          value={labFilter}
          onValueChange={(value) =>
            setLabFilter(typeof value === 'string' ? value : '')
          }
        >
          <SelectTrigger className='w-56'>
            <SelectValue placeholder={t('lab.allLaboratories')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=''>{t('lab.allLaboratories')}</SelectItem>
            {laboratoryOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={[
            { value: '', label: t('lab.allStatuses') },
            ...optionLabels(EQUIPMENT_STATUS_OPTIONS, t),
          ]}
          value={statusFilter}
          onValueChange={(value) =>
            setStatusFilter(typeof value === 'string' ? value : '')
          }
        >
          <SelectTrigger className='w-48'>
            <SelectValue placeholder={t('lab.allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=''>{t('lab.allStatuses')}</SelectItem>
            {optionLabels(EQUIPMENT_STATUS_OPTIONS, t).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {message ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('lab.loadFailed')}</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        columns={columns}
        emptyKey='equipment.empty'
        loading={list.loading}
        onRowClick={(row) => void navigate(`/equipment/${row.id}`)}
        rowKey={(row) => row.id}
        rows={list.data ?? []}
        searchText={(row) =>
          `${row.model ?? ''} ${row.serialNo ?? ''} ${row.category ?? ''}`
        }
      />

      {creating ? (
        <FormDialog
          descriptionKey='lab.createEquipmentHint'
          fields={equipmentFields(t, laboratoryOptions, true)}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            await api.createEquipment(values);
            setCreating(false);
            list.reload();
          }}
          titleKey='lab.createEquipment'
        />
      ) : null}

      {editing ? (
        <FormDialog
          descriptionKey='lab.editEquipmentHint'
          fields={equipmentFields(t, laboratoryOptions, false)}
          initialValues={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await api.updateEquipment(editing.id, values);
            setEditing(null);
            list.reload();
          }}
          titleKey='lab.editEquipment'
        />
      ) : null}

      {/* The detail page renders here, covering this list without unmounting it. */}
      <Outlet />
    </PageContainer>
  );
}
