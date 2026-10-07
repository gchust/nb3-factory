import { useTranslation } from '@nocobase/i18n/client';
import { CheckIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table/index.js';
import { PageContainer } from '@/components/page-container.js';
import { PageHeader } from '@/components/page-header.js';
import { InspectionStatusBadge } from '@/components/service/badges.js';
import { Field, FormDialog } from '@/components/service/form-dialog.js';
import { formatDate } from '@/components/service/format.js';
import { SelectField } from '@/components/service/select-field.js';
import { EmptyTable, RequestError } from '@/components/service/states.js';
import type { InspectionTaskView, Paged } from '@/components/service/types.js';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useApiQuery, useClient } from '@/hooks/use-service-api.js';

const STATUSES = ['pending', 'completed', 'skipped'] as const;

export default function InspectionsPage(): ReactElement {
  const { t } = useTranslation();
  const client = useClient();
  const [status, setStatus] = useState('');
  const [completing, setCompleting] = useState<InspectionTaskView | null>(null);
  const [result, setResult] = useState<'normal' | 'abnormal'>('normal');
  const [remark, setRemark] = useState('');

  const list = useApiQuery<Paged<InspectionTaskView>>('/inspectionTasks', {
    status: status || undefined,
    pageSize: 200,
  });

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('service.filter.allStatuses') },
      ...STATUSES.map((value) => ({
        value,
        label: t(`service.inspection.status.${value}`, { defaultValue: value }),
      })),
    ],
    [t],
  );

  const submit = async () => {
    if (!completing) return;
    await client.request({
      path: `/inspectionTasks/${completing.id}/complete`,
      method: 'POST',
      json: { result, remark: remark.trim() || null },
    });
    setCompleting(null);
    setRemark('');
    setResult('normal');
    list.reload();
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: 'deviceCode',
        header: t('service.device.code'),
        cell: ({ row }: { row: { original: InspectionTaskView } }) => (
          <span className='font-mono text-xs'>
            {row.original.deviceCode ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'deviceName',
        header: t('service.device.name'),
        cell: ({ row }: { row: { original: InspectionTaskView } }) => (
          <span>{row.original.deviceName ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'customerName',
        header: t('service.device.customer'),
        cell: ({ row }: { row: { original: InspectionTaskView } }) => (
          <span>{row.original.customerName ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'assigneeName',
        header: t('service.workOrder.assignee'),
        cell: ({ row }: { row: { original: InspectionTaskView } }) => (
          <span>{row.original.assigneeName ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'planDate',
        header: t('service.inspection.planDate'),
        cell: ({ row }: { row: { original: InspectionTaskView } }) => (
          <span>{formatDate(row.original.planDate)}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: t('service.inspection.statusLabel'),
        cell: ({ row }: { row: { original: InspectionTaskView } }) => (
          <InspectionStatusBadge status={row.original.status} />
        ),
      },
      {
        accessorKey: 'result',
        header: t('service.inspection.result'),
        cell: ({ row }: { row: { original: InspectionTaskView } }) =>
          row.original.result ? (
            <span>
              {t(`service.inspection.resultValue.${row.original.result}`, {
                defaultValue: row.original.result,
              })}
            </span>
          ) : (
            <span>—</span>
          ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: { original: InspectionTaskView } }) =>
          row.original.status === 'pending' ? (
            <Button
              size='sm'
              onClick={() => {
                setCompleting(row.original);
                setResult('normal');
                setRemark('');
              }}
            >
              <CheckIcon />
              {t('service.inspection.complete')}
            </Button>
          ) : null,
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.inspection.title')}
        description={t('service.inspection.description')}
      />

      <SelectField
        value={status || ''}
        onValueChange={setStatus}
        options={statusOptions}
        placeholder={t('service.filter.status')}
      />

      {list.error ? (
        <RequestError error={list.error} onRetry={list.reload} />
      ) : null}

      {list.data ? (
        list.data.data.length === 0 ? (
          <EmptyTable title={t('service.inspection.empty')} />
        ) : (
          <DataTable
            columns={columns}
            data={[...list.data.data]}
            getRowId={(row) => row.id}
            showSelectedCount={false}
            emptyMessage={t('service.inspection.empty')}
          />
        )
      ) : null}

      <FormDialog
        open={completing !== null}
        onOpenChange={(open) => {
          if (!open) setCompleting(null);
        }}
        title={t('service.inspection.complete')}
        onSubmit={submit}
        canSubmit
      >
        <Field label={t('service.inspection.result')} htmlFor='inspection-result'>
          <SelectField
            id='inspection-result'
            value={result}
            onValueChange={(value) => setResult(value as 'normal' | 'abnormal')}
            options={[
              {
                value: 'normal',
                label: t('service.inspection.resultValue.normal'),
              },
              {
                value: 'abnormal',
                label: t('service.inspection.resultValue.abnormal'),
              },
            ]}
            className='w-full'
          />
        </Field>
        <Field label={t('service.inspection.remark')} htmlFor='inspection-remark'>
          <Textarea
            id='inspection-remark'
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
          />
        </Field>
      </FormDialog>
    </PageContainer>
  );
}
