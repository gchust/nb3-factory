/**
 * Leave approvals: the pending and decided requests a supervisor or an HR
 * person is responsible for.
 *
 * The server already narrows the list to the departments the signed-in person
 * manages; this page adds nothing to that scope. Rejecting requires a reason,
 * which the server enforces and this dialog asks for before it sends.
 */
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { useState, type ReactElement } from 'react';

import { DataTable } from '@/components/data-table/index.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  decideLeaveRequest,
  fetchDashboard,
  fetchEmployees,
  fetchLeaveRequests,
} from './api.js';
import {
  LEAVE_STATUSES,
  type HrLeaveRequest,
  type LeaveStatus,
} from './types.js';
import {
  EmptyState,
  FieldValue,
  HrErrorState,
  HrLoading,
  LeaveStatusBadge,
} from './ui.js';

function DecisionDialog({
  request,
  applicantName,
  onClose,
  onDecided,
}: {
  readonly request: HrLeaveRequest;
  readonly applicantName: string;
  readonly onClose: () => void;
  readonly onDecided: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const decide = (decision: 'approved' | 'rejected'): void => {
    if (decision === 'rejected' && !reason.trim()) {
      setError(t('hr.approvals.reasonRequired'));
      return;
    }
    setPending(true);
    setError(undefined);
    decideLeaveRequest(
      api,
      request.id,
      decision,
      reason.trim() || undefined,
    ).then(
      () => {
        setPending(false);
        toaster.show({
          type: 'success',
          title:
            decision === 'approved'
              ? t('hr.approvals.approved')
              : t('hr.approvals.rejected'),
        });
        onDecided();
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
        <DialogTitle>{t('hr.approvals.decide')}</DialogTitle>
        <DialogDescription>
          {applicantName} · {t(`hr.leave.types.${request.type}`)} ·{' '}
          {request.startDate} ~ {request.endDate}
        </DialogDescription>
      </DialogHeader>
      <div className='grid gap-4'>
        <div className='text-sm'>
          <p className='text-muted-foreground'>
            {t('hr.approvals.applicantReason')}
          </p>
          <p className='mt-1'>
            <FieldValue value={request.reason} />
          </p>
        </div>
        <div className='grid gap-2'>
          <Label htmlFor='decision-reason'>
            {t('hr.approvals.rejectionReason')}
          </Label>
          <Textarea
            id='decision-reason'
            value={reason}
            placeholder={t('hr.approvals.rejectionReasonPlaceholder')}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        {error ? <p className='text-sm text-destructive'>{error}</p> : null}
      </div>
      <DialogFooter>
        <Button variant='outline' onClick={onClose}>
          {t('hr.actions.cancel')}
        </Button>
        <Button
          variant='destructive'
          disabled={pending}
          onClick={() => decide('rejected')}
        >
          {t('hr.approvals.reject')}
        </Button>
        <Button disabled={pending} onClick={() => decide('approved')}>
          {t('hr.approvals.approve')}
        </Button>
      </DialogFooter>
    </>
  );
}

export default function HrApprovalsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [status, setStatus] = useState<'' | LeaveStatus>('pending');
  const [selected, setSelected] = useState<HrLeaveRequest>();

  const dashboard = useApiData('hr.dashboard', (signal) =>
    fetchDashboard(api, signal),
  );
  const employees = useApiData('hr.employees', (signal) =>
    fetchEmployees(api, {}, signal),
  );
  const requests = useApiData(`hr.approvals:${status}`, (signal) =>
    fetchLeaveRequests(api, { status: status || undefined }, signal),
  );

  const names = new Map(
    (employees.data ?? []).map((employee) => [employee.id, employee.name]),
  );
  const canApprove = dashboard.data?.isHr || dashboard.data?.isSupervisor;

  const columns: ColumnDef<HrLeaveRequest>[] = [
    {
      id: 'applicant',
      header: t('hr.approvals.applicant'),
      cell: ({ row }) =>
        names.get(row.original.employeeId) ?? `#${row.original.employeeId}`,
    },
    {
      accessorKey: 'type',
      header: t('hr.leave.type'),
      cell: ({ row }) => t(`hr.leave.types.${row.original.type}`),
    },
    { accessorKey: 'startDate', header: t('hr.leave.startDate') },
    { accessorKey: 'endDate', header: t('hr.leave.endDate') },
    { accessorKey: 'days', header: t('hr.leave.days') },
    {
      accessorKey: 'status',
      header: t('hr.leave.status'),
      cell: ({ row }) => <LeaveStatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        canApprove && row.original.status === 'pending' ? (
          <Button
            variant='outline'
            size='sm'
            onClick={() => setSelected(row.original)}
          >
            {t('hr.approvals.decide')}
          </Button>
        ) : null,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('hr.approvals.title')}
        description={t('hr.approvals.description')}
      />

      {dashboard.data && !canApprove ? (
        <EmptyState message={t('hr.approvals.notAllowed')} />
      ) : (
        <>
          <div className='flex flex-wrap items-center gap-2'>
            <select
              className='border-input bg-background h-8 rounded-lg border px-2 text-sm'
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as '' | LeaveStatus)
              }
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
                <HrErrorState
                  error={requests.error}
                  onRetry={requests.reload}
                />
              ) : null}
              {requests.data ? (
                requests.data.length === 0 ? (
                  <EmptyState message={t('hr.approvals.empty')} />
                ) : (
                  <DataTable
                    columns={columns}
                    data={requests.data}
                    showSelectedCount={false}
                    emptyMessage={t('hr.approvals.empty')}
                  />
                )
              ) : null}
            </CardContent>
          </Card>
        </>
      )}

      {selected ? (
        <Dialog
          open
          onOpenChange={(open) => (open ? undefined : setSelected(undefined))}
        >
          <DialogContent className='sm:max-w-lg'>
            <DecisionDialog
              request={selected}
              applicantName={
                names.get(selected.employeeId) ?? `#${selected.employeeId}`
              }
              onClose={() => setSelected(undefined)}
              onDecided={() => {
                setSelected(undefined);
                requests.reload();
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </PageContainer>
  );
}
