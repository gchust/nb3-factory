/**
 * My leave: the requests the signed-in employee has submitted, with a form to
 * apply and to edit a rejected request and resubmit it.
 *
 * The server only returns the signed-in person's own requests for `mine=true`,
 * and refuses an edit of a request that is not rejected, so this page offers
 * the resubmit action only on a rejected row.
 */
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { DataTable } from '@/components/data-table/index.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DatePicker } from '@/components/date-picker.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageContainer } from '@/components/page-container.js';
import { PageHeader } from '@/components/page-header.js';
import { useApiData } from '@/hooks/use-api-data.js';

import {
  applyLeave,
  fetchLeaveRequests,
  updateLeaveRequest,
  type LeaveInput,
} from './api.js';
import {
  LEAVE_STATUSES,
  LEAVE_TYPES,
  type HrLeaveRequest,
  type LeaveStatus,
  type LeaveType,
} from './types.js';
import {
  EmptyState,
  FieldValue,
  HrErrorState,
  HrLoading,
  LeaveStatusBadge,
} from './ui.js';

function toDate(value: string | null | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function toIso(value: Date | undefined): string | undefined {
  return value ? value.toISOString().slice(0, 10) : undefined;
}

function LeaveFormDialog({
  request,
  onClose,
  onSaved,
}: {
  readonly request?: HrLeaveRequest;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [type, setType] = useState<LeaveType>(
    (request?.type as LeaveType) ?? 'annual',
  );
  const [startDate, setStartDate] = useState(() => toDate(request?.startDate));
  const [endDate, setEndDate] = useState(() => toDate(request?.endDate));
  const [reason, setReason] = useState(request?.reason ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = (): void => {
    if (!startDate || !endDate) {
      setError(t('hr.leave.datesRequired'));
      return;
    }
    if (endDate < startDate) {
      setError(t('hr.leave.rangeInvalid'));
      return;
    }
    const input: LeaveInput = {
      type,
      startDate: toIso(startDate),
      endDate: toIso(endDate),
      reason: reason.trim() || undefined,
      ...(request ? { resubmit: true } : {}),
    };
    setPending(true);
    setError(undefined);
    const action = request
      ? updateLeaveRequest(api, request.id, input)
      : applyLeave(api, input);
    action.then(
      () => {
        setPending(false);
        toaster.show({ type: 'success', title: t('hr.leave.saved') });
        onSaved();
      },
      () => {
        setPending(false);
        setError(t('hr.error.requestFailedDescription'));
      },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {request ? t('hr.leave.resubmit') : t('hr.leave.apply')}
        </DialogTitle>
        <DialogDescription>{t('hr.leave.formDescription')}</DialogDescription>
      </DialogHeader>
      <div className='grid gap-4'>
        {request?.status === 'rejected' && request.rejectionReason ? (
          <p className='rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'>
            {t('hr.leave.rejectionReason')}: {request.rejectionReason}
          </p>
        ) : null}
        <div className='grid gap-2'>
          <Label htmlFor='leave-type'>{t('hr.leave.type')}</Label>
          <select
            id='leave-type'
            className='border-input bg-background h-8 rounded-lg border px-2 text-sm'
            value={type}
            onChange={(event) => setType(event.target.value as LeaveType)}
          >
            {LEAVE_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`hr.leave.types.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className='grid gap-2 sm:grid-cols-2'>
          <div className='grid gap-2'>
            <Label>{t('hr.leave.startDate')}</Label>
            <DatePicker value={startDate} onChange={setStartDate} />
          </div>
          <div className='grid gap-2'>
            <Label>{t('hr.leave.endDate')}</Label>
            <DatePicker value={endDate} onChange={setEndDate} />
          </div>
        </div>
        <div className='grid gap-2'>
          <Label htmlFor='leave-reason'>{t('hr.leave.reason')}</Label>
          <Textarea
            id='leave-reason'
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        {error ? <p className='text-sm text-destructive'>{error}</p> : null}
      </div>
      <DialogFooter>
        <Button variant='outline' onClick={onClose}>
          {t('hr.actions.cancel')}
        </Button>
        <Button onClick={submit} disabled={pending}>
          {pending ? t('hr.actions.saving') : t('hr.actions.save')}
        </Button>
      </DialogFooter>
    </>
  );
}

export default function HrLeavePage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [status, setStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HrLeaveRequest>();

  const requests = useApiData(`hr.leave.mine:${status}`, (signal) =>
    fetchLeaveRequests(
      api,
      { mine: true, status: status ? (status as LeaveStatus) : undefined },
      signal,
    ),
  );

  const columns: ColumnDef<HrLeaveRequest>[] = [
    {
      accessorKey: 'type',
      header: t('hr.leave.type'),
      cell: ({ row }) => t(`hr.leave.types.${row.original.type}`),
    },
    { accessorKey: 'startDate', header: t('hr.leave.startDate') },
    { accessorKey: 'endDate', header: t('hr.leave.endDate') },
    { accessorKey: 'days', header: t('hr.leave.days') },
    {
      accessorKey: 'reason',
      header: t('hr.leave.reason'),
      cell: ({ row }) => <FieldValue value={row.original.reason} />,
    },
    {
      accessorKey: 'status',
      header: t('hr.leave.status'),
      cell: ({ row }) => <LeaveStatusBadge status={row.original.status} />,
    },
    {
      id: 'rejection',
      header: t('hr.leave.rejectionReason'),
      cell: ({ row }) => <FieldValue value={row.original.rejectionReason} />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        row.original.status === 'rejected' ? (
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              setEditing(row.original);
              setFormOpen(true);
            }}
          >
            {t('hr.leave.resubmit')}
          </Button>
        ) : null,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('hr.leave.title')}
        description={t('hr.leave.description')}
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <PlusIcon />
            {t('hr.leave.apply')}
          </Button>
        }
      />

      <div className='flex flex-wrap items-center gap-2'>
        <select
          className='border-input bg-background h-8 rounded-lg border px-2 text-sm'
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value=''>{t('hr.leave.allStatuses')}</option>
          {LEAVE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`hr.status.leave.${value}`)}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <CardContent>
          {requests.loading ? <HrLoading rows={4} /> : null}
          {requests.error ? (
            <HrErrorState error={requests.error} onRetry={requests.reload} />
          ) : null}
          {requests.data ? (
            requests.data.length === 0 ? (
              <EmptyState message={t('hr.leave.empty')} />
            ) : (
              <DataTable
                columns={columns}
                data={requests.data}
                showSelectedCount={false}
                emptyMessage={t('hr.leave.empty')}
              />
            )
          ) : null}
        </CardContent>
      </Card>

      {formOpen ? (
        <Dialog
          open
          onOpenChange={(open) => (open ? undefined : setFormOpen(false))}
        >
          <DialogContent className='sm:max-w-lg'>
            <LeaveFormDialog
              request={editing}
              onClose={() => setFormOpen(false)}
              onSaved={() => {
                setFormOpen(false);
                requests.reload();
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </PageContainer>
  );
}
