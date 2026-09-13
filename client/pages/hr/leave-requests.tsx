import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DecisionControls,
  EmptyBlock,
  ErrorBanner,
  Field,
  HrPage,
  LoadingBlock,
  NativeSelect,
  SectionCard,
  StatusBadge,
  SubmitButton,
  SuccessBanner,
  TableShell,
  Td,
} from '@/components/hr/hr-ui.js';
import {
  toHrApiError,
  useHrApi,
  useHrQuery,
  type HrApiError,
  type HrLeaveRequest,
} from '@/components/hr/hr-api.js';

interface LeaveForm {
  employeeId: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  attachmentId: string;
  attachmentName: string;
}

const EMPTY_FORM: LeaveForm = {
  employeeId: '',
  type: 'annual',
  startDate: '',
  endDate: '',
  reason: '',
  attachmentId: '',
  attachmentName: '',
};

function previewDays(start: string, end: string): number | null {
  if (!start || !end) return null;
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000) + 1;
}

export default function LeaveRequestsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useHrApi();
  const [form, setForm] = useState<LeaveForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<HrLeaveRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [error, setError] = useState<HrApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const me = useHrQuery(() => api.getMe(), 'me');
  const employees = useHrQuery(() => api.listEmployees(), 'employees');
  const leaves = useHrQuery(
    () =>
      api.listLeaveRequests(
        statusFilter ? { status: statusFilter } : undefined,
      ),
    `leaves:${statusFilter}`,
  );

  const canManage = me.data?.canManage === true;
  const canApprove = me.data?.canApprove === true;
  const selfEmployeeId = me.data?.employee?.id ?? null;
  const effectiveEmployeeId = canManage
    ? form.employeeId
    : selfEmployeeId === null
      ? ''
      : String(selfEmployeeId);

  const update = (patch: Partial<LeaveForm>): void =>
    setForm((current) => ({ ...current, ...patch }));

  const reset = (): void => {
    setForm(EMPTY_FORM);
    setEditing(null);
  };

  const startEdit = (request: HrLeaveRequest): void => {
    setEditing(request);
    setForm({
      employeeId: String(request.employeeId),
      type: request.type,
      startDate: request.startDate,
      endDate: request.endDate,
      reason: request.reason ?? '',
      attachmentId: request.attachmentId ?? '',
      attachmentName: request.attachmentName ?? '',
    });
  };

  const employeeName = (id: number): string =>
    employees.data?.find((employee) => employee.id === id)?.name ??
    t('hr.common.unknownEmployee', { defaultValue: 'Employee #{{id}}', id });

  const selectedEmployee = (employees.data ?? []).find(
    (employee) => String(employee.id) === effectiveEmployeeId,
  );
  const usedAnnual = (leaves.data ?? [])
    .filter(
      (request) =>
        String(request.employeeId) === effectiveEmployeeId &&
        request.type === 'annual' &&
        request.status !== 'rejected' &&
        request.id !== editing?.id,
    )
    .reduce((total, request) => total + Number(request.days), 0);
  const remainingAnnual = selectedEmployee
    ? selectedEmployee.annualLeaveDays - usedAnnual
    : null;
  const days = previewDays(form.startDate, form.endDate);

  const uploadAttachment = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const attachment = await api.uploadAttachment(file);
      update({
        attachmentId: attachment.id,
        attachmentName: attachment.filename,
      });
    } catch (cause) {
      setError(toHrApiError(cause));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    const payload = {
      employeeId: effectiveEmployeeId ? Number(effectiveEmployeeId) : undefined,
      type: form.type,
      startDate: form.startDate,
      endDate: form.endDate,
      reason: form.reason || null,
      attachmentId: form.attachmentId || null,
      attachmentName: form.attachmentName || null,
    };
    try {
      if (editing) {
        await api.updateLeaveRequest(editing.id, payload);
        setSuccess(
          t('hr.leave.updated', { defaultValue: 'Leave request updated.' }),
        );
      } else {
        await api.createLeaveRequest(payload);
        setSuccess(
          t('hr.leave.created', { defaultValue: 'Leave request submitted.' }),
        );
      }
      reset();
      leaves.reload();
    } catch (cause) {
      setError(toHrApiError(cause));
    } finally {
      setBusy(false);
    }
  };

  const decide = async (
    request: HrLeaveRequest,
    status: 'approved' | 'rejected',
    comment: string,
  ): Promise<void> => {
    setDecidingId(request.id);
    setError(null);
    setSuccess(null);
    try {
      await api.decideLeaveRequest(request.id, { status, comment });
      setSuccess(t('hr.approval.done', { defaultValue: 'Decision recorded.' }));
      leaves.reload();
    } catch (cause) {
      setError(toHrApiError(cause));
    } finally {
      setDecidingId(null);
    }
  };

  // Editing is offered for anything the caller may change; the server still
  // rejects an approved request, which is what the "approved leave is
  // immutable" rule must surface.
  const canEdit = (request: HrLeaveRequest): boolean =>
    canManage || request.employeeId === selfEmployeeId;

  return (
    <HrPage
      title={t('hr.leave.title', { defaultValue: 'Leave requests' })}
      description={t('hr.leave.description', {
        defaultValue:
          'Submit leave, track approval status, and review the annual leave balance.',
      })}
    >
      <ErrorBanner error={error ?? me.error ?? leaves.error} />
      <SuccessBanner message={success} />

      {me.data?.employee || canManage ? (
        <SectionCard
          title={
            editing
              ? t('hr.leave.editTitle', { defaultValue: 'Edit leave request' })
              : t('hr.leave.createTitle', { defaultValue: 'New leave request' })
          }
          actions={
            editing ? (
              <Button type='button' variant='ghost' onClick={reset}>
                {t('actions.cancel', { defaultValue: 'Cancel' })}
              </Button>
            ) : null
          }
        >
          <form
            className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
            onSubmit={(event) => void submit(event)}
          >
            <Field label={t('hr.leave.employee', { defaultValue: 'Employee' })}>
              <NativeSelect
                required
                disabled={!canManage}
                value={effectiveEmployeeId}
                onChange={(event) => update({ employeeId: event.target.value })}
              >
                <option value=''>
                  {t('hr.common.selectPlaceholder', {
                    defaultValue: 'Select…',
                  })}
                </option>
                {(employees.data ?? []).map((employee) => (
                  <option key={employee.id} value={String(employee.id)}>
                    {employee.name} ({employee.employeeNo})
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t('hr.leave.type', { defaultValue: 'Leave type' })}>
              <NativeSelect
                value={form.type}
                onChange={(event) => update({ type: event.target.value })}
              >
                <option value='annual'>
                  {t('hr.leaveType.annual', { defaultValue: 'Annual leave' })}
                </option>
                <option value='sick'>
                  {t('hr.leaveType.sick', { defaultValue: 'Sick leave' })}
                </option>
                <option value='personal'>
                  {t('hr.leaveType.personal', {
                    defaultValue: 'Personal leave',
                  })}
                </option>
              </NativeSelect>
            </Field>
            <Field
              label={t('hr.leave.startDate', { defaultValue: 'Start date' })}
            >
              <Input
                required
                type='date'
                value={form.startDate}
                onChange={(event) => update({ startDate: event.target.value })}
              />
            </Field>
            <Field label={t('hr.leave.endDate', { defaultValue: 'End date' })}>
              <Input
                required
                type='date'
                value={form.endDate}
                onChange={(event) => update({ endDate: event.target.value })}
              />
            </Field>
            <Field
              label={t('hr.leave.days', { defaultValue: 'Leave days' })}
              hint={t('hr.leave.daysHint', {
                defaultValue:
                  'Calculated automatically from the start and end dates.',
              })}
            >
              <Input
                readOnly
                tabIndex={-1}
                value={days === null ? '' : String(days)}
                aria-label={t('hr.leave.days', { defaultValue: 'Leave days' })}
              />
            </Field>
            <Field
              label={t('hr.leave.remainingAnnual', {
                defaultValue: 'Remaining annual leave',
              })}
              hint={
                remainingAnnual === null
                  ? undefined
                  : t('hr.leave.remainingAnnualValue', {
                      defaultValue: '{{days}} day(s)',
                      days: remainingAnnual,
                    })
              }
            >
              <Input
                readOnly
                tabIndex={-1}
                value={remainingAnnual === null ? '' : String(remainingAnnual)}
                aria-label={t('hr.leave.remainingAnnual', {
                  defaultValue: 'Remaining annual leave',
                })}
              />
            </Field>
            <Field label={t('hr.leave.reason', { defaultValue: 'Reason' })}>
              <Textarea
                rows={2}
                value={form.reason}
                onChange={(event) => update({ reason: event.target.value })}
              />
            </Field>
            <Field
              label={t('hr.leave.attachment', {
                defaultValue: 'Sick leave certificate',
              })}
              hint={form.attachmentName ?? undefined}
            >
              <Input
                type='file'
                accept='image/*,.pdf'
                disabled={uploading}
                onChange={(event) =>
                  void uploadAttachment(event.target.files?.[0])
                }
              />
            </Field>
            <div className='flex items-end'>
              <SubmitButton busy={busy || uploading}>
                {editing
                  ? t('actions.save', { defaultValue: 'Save' })
                  : t('hr.leave.submit', { defaultValue: 'Submit request' })}
              </SubmitButton>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title={t('hr.leave.listTitle', { defaultValue: 'Leave requests' })}
        actions={
          <div className='w-48'>
            <NativeSelect
              aria-label={t('hr.common.statusFilter', {
                defaultValue: 'Filter by status',
              })}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value=''>
                {t('hr.common.allStatuses', { defaultValue: 'All statuses' })}
              </option>
              <option value='pending'>
                {t('hr.status.pending', { defaultValue: 'Pending' })}
              </option>
              <option value='approved'>
                {t('hr.status.approved', { defaultValue: 'Approved' })}
              </option>
              <option value='rejected'>
                {t('hr.status.rejected', { defaultValue: 'Rejected' })}
              </option>
            </NativeSelect>
          </div>
        }
      >
        {leaves.loading ? <LoadingBlock /> : null}
        {!leaves.loading && (leaves.data ?? []).length === 0 ? (
          <EmptyBlock
            label={t('hr.leave.empty', {
              defaultValue: 'No leave requests.',
            })}
          />
        ) : null}
        {(leaves.data ?? []).length > 0 ? (
          <TableShell
            head={[
              t('hr.leave.employee', { defaultValue: 'Employee' }),
              t('hr.leave.type', { defaultValue: 'Leave type' }),
              t('hr.leave.startDate', { defaultValue: 'Start date' }),
              t('hr.leave.endDate', { defaultValue: 'End date' }),
              t('hr.leave.days', { defaultValue: 'Leave days' }),
              t('hr.leave.reason', { defaultValue: 'Reason' }),
              t('hr.common.status', { defaultValue: 'Status' }),
              t('hr.approval.approver', { defaultValue: 'Approver' }),
              t('hr.approval.comment', { defaultValue: 'Approval comment' }),
              t('hr.leave.attachment', {
                defaultValue: 'Sick leave certificate',
              }),
              t('hr.common.actions', { defaultValue: 'Actions' }),
            ]}
          >
            {(leaves.data ?? []).map((request) => (
              <tr key={request.id} className='border-b border-border'>
                <Td className='font-medium'>
                  {employeeName(request.employeeId)}
                </Td>
                <Td>
                  {t(`hr.leaveType.${request.type}`, {
                    defaultValue: request.type,
                  })}
                </Td>
                <Td>{request.startDate}</Td>
                <Td>{request.endDate}</Td>
                <Td>{request.days}</Td>
                <Td className='max-w-48 truncate'>{request.reason ?? '—'}</Td>
                <Td>
                  <StatusBadge status={request.status} />
                </Td>
                <Td>{request.approverName ?? '—'}</Td>
                <Td className='max-w-48 truncate'>
                  {request.approvalComment ?? '—'}
                </Td>
                <Td>
                  {request.attachmentId ? (
                    <a
                      className='text-primary underline underline-offset-4'
                      href={api.attachmentUrl(request.attachmentId)}
                      target='_blank'
                      rel='noreferrer'
                    >
                      {request.attachmentName ??
                        t('hr.common.download', { defaultValue: 'Download' })}
                    </a>
                  ) : (
                    '—'
                  )}
                </Td>
                <Td>
                  <div className='flex items-center gap-2'>
                    {canEdit(request) ? (
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => startEdit(request)}
                      >
                        {t('actions.edit', { defaultValue: 'Edit' })}
                      </Button>
                    ) : null}
                    {canApprove && request.status === 'pending' ? (
                      <DecisionControls
                        busy={decidingId === request.id}
                        onDecide={(status, comment) =>
                          void decide(request, status, comment)
                        }
                      />
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))}
          </TableShell>
        ) : null}
      </SectionCard>
    </HrPage>
  );
}
