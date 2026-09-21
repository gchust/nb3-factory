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
import {
  equipmentChoices,
  laboratoryChoices,
  workOrderFields,
} from '@/lib/lab-fields';
import { formatMoment } from '@/lib/lab-format';
import { labelFor, optionLabels } from '@/lib/lab-options';
import { hasStaffRole } from '@/lib/lab-permissions';
import { statusTone } from '@/lib/lab-status';
import {
  WORK_ORDER_PRIORITY_OPTIONS,
  WORK_ORDER_STATUS_OPTIONS,
  WORK_ORDER_TYPE_OPTIONS,
  type WorkOrderView,
} from '@/lib/lab-types';
import { useAsync } from '@/lib/use-async';

/** The maintenance queue, filtered by status, priority and laboratory. */
export default function WorkOrdersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useLabApi();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [labId, setLabId] = useState('');
  const [creating, setCreating] = useState(false);

  const access = useAsync('access', () => api.access());
  const laboratories = useAsync('laboratories', () => api.laboratories());
  const equipment = useAsync('equipment-for-work-orders', () =>
    api.equipment(),
  );
  const list = useAsync(`work-orders:${status}:${priority}:${labId}`, () =>
    api.workOrders({ status, priority, labId }),
  );
  const message = useLabErrorMessage(list.error);

  const laboratoryOptions = laboratoryChoices(laboratories.data ?? []);
  const mayCreate = hasStaffRole(access.data, [
    'lab_admin',
    'teacher',
    'technician',
    'safety_officer',
  ]);

  const columns: DataTableColumn<WorkOrderView>[] = [
    {
      key: 'code',
      headerKey: 'lab.code',
      text: (row) => row.code,
      className: 'font-medium',
    },
    { key: 'title', headerKey: 'lab.title', text: (row) => row.title },
    {
      key: 'equipment',
      headerKey: 'lab.equipment',
      text: (row) => `${row.assetNo ?? ''} ${row.equipmentName ?? ''}`,
      render: (row) => (
        <span>
          {row.assetNo ? (
            <span className='text-muted-foreground'>{row.assetNo} · </span>
          ) : null}
          {row.equipmentName ?? t('lab.unset')}
        </span>
      ),
    },
    {
      key: 'type',
      headerKey: 'lab.workOrderType',
      text: (row) => row.type,
      render: (row) => labelFor(WORK_ORDER_TYPE_OPTIONS, row.type, t),
    },
    {
      key: 'priority',
      headerKey: 'lab.priority',
      text: (row) => row.priority,
      render: (row) => (
        <Badge variant={statusTone(row.priority)}>
          {labelFor(WORK_ORDER_PRIORITY_OPTIONS, row.priority, t)}
        </Badge>
      ),
    },
    {
      key: 'status',
      headerKey: 'lab.status',
      text: (row) => row.status,
      render: (row) => (
        <Badge variant={statusTone(row.status)}>
          {labelFor(WORK_ORDER_STATUS_OPTIONS, row.status, t)}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      headerKey: 'lab.createdAt',
      text: (row) => row.createdAt ?? '',
      render: (row) => formatMoment(t, row.createdAt),
    },
    {
      key: 'actions',
      headerKey: 'lab.actions',
      className: 'w-28',
      render: (row) => (
        <div className='flex justify-end'>
          <Button
            size='sm'
            variant='ghost'
            onClick={(event) => {
              event.stopPropagation();
              void navigate(`/work-orders/${row.id}`);
            }}
          >
            {t('lab.details')}
          </Button>
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
                {t('lab.createWorkOrder')}
              </Button>
            ) : null}
          </>
        }
        description={t('workOrders.description')}
        title={t('workOrders.title')}
      />

      <div className='flex flex-wrap items-center gap-2'>
        <Select
          items={[
            { value: '', label: t('lab.allStatuses') },
            ...optionLabels(WORK_ORDER_STATUS_OPTIONS, t),
          ]}
          value={status}
          onValueChange={(value) =>
            setStatus(typeof value === 'string' ? value : '')
          }
        >
          <SelectTrigger className='w-48'>
            <SelectValue placeholder={t('lab.allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=''>{t('lab.allStatuses')}</SelectItem>
            {optionLabels(WORK_ORDER_STATUS_OPTIONS, t).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={[
            { value: '', label: t('lab.allPriorities') },
            ...optionLabels(WORK_ORDER_PRIORITY_OPTIONS, t),
          ]}
          value={priority}
          onValueChange={(value) =>
            setPriority(typeof value === 'string' ? value : '')
          }
        >
          <SelectTrigger className='w-44'>
            <SelectValue placeholder={t('lab.allPriorities')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=''>{t('lab.allPriorities')}</SelectItem>
            {optionLabels(WORK_ORDER_PRIORITY_OPTIONS, t).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={[
            { value: '', label: t('lab.allLaboratories') },
            ...laboratoryOptions,
          ]}
          value={labId}
          onValueChange={(value) =>
            setLabId(typeof value === 'string' ? value : '')
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
      </div>

      {message ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('lab.loadFailed')}</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        columns={columns}
        emptyKey='workOrders.empty'
        loading={list.loading}
        onRowClick={(row) => void navigate(`/work-orders/${row.id}`)}
        rowKey={(row) => row.id}
        rows={list.data ?? []}
        searchText={(row) => `${row.description ?? ''} ${row.labName ?? ''}`}
      />

      {creating ? (
        <FormDialog
          descriptionKey='lab.createWorkOrderHint'
          fields={workOrderFields(t, equipmentChoices(equipment.data ?? []))}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            await api.createWorkOrder(values);
            setCreating(false);
            list.reload();
          }}
          titleKey='lab.createWorkOrder'
        />
      ) : null}

      {/* The detail page renders here, covering this list without unmounting it. */}
      <Outlet />
    </PageContainer>
  );
}
