import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';

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
  type HrOvertimeRequest,
} from '@/components/hr/hr-api.js';

interface OvertimeForm {
  employeeId: string;
  overtimeDate: string;
  hours: string;
  reason: string;
}

const EMPTY_FORM: OvertimeForm = {
  employeeId: '',
  overtimeDate: '',
  hours: '',
  reason: '',
};

export default function OvertimeRequestsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useHrApi();
  const [form, setForm] = useState<OvertimeForm>(EMPTY_FORM);
  const [statusFilter, setStatusFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [error, setError] = useState<HrApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const me = useHrQuery(() => api.getMe(), 'me');
  const employees = useHrQuery(() => api.listEmployees(), 'employees');
  const overtimes = useHrQuery(
    () =>
      api.listOvertimeRequests(
        statusFilter ? { status: statusFilter } : undefined,
      ),
    `overtimes:${statusFilter}`,
  );

  const canManage = me.data?.canManage === true;
  const canApprove = me.data?.canApprove === true;
  const selfEmployeeId = me.data?.employee?.id ?? null;
  const effectiveEmployeeId = canManage
    ? form.employeeId
    : selfEmployeeId === null
      ? ''
      : String(selfEmployeeId);

  const update = (patch: Partial<OvertimeForm>): void =>
    setForm((current) => ({ ...current, ...patch }));

  const employeeName = (id: number): string =>
    employees.data?.find((employee) => employee.id === id)?.name ??
    t('hr.common.unknownEmployee', { defaultValue: 'Employee #{{id}}', id });

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await api.createOvertimeRequest({
        employeeId: effectiveEmployeeId
          ? Number(effectiveEmployeeId)
          : undefined,
        overtimeDate: form.overtimeDate,
        hours: Number(form.hours),
        reason: form.reason || null,
      });
      setSuccess(
        t('hr.overtime.created', {
          defaultValue: 'Overtime request submitted.',
        }),
      );
      setForm(EMPTY_FORM);
      overtimes.reload();
    } catch (cause) {
      setError(toHrApiError(cause));
    } finally {
      setBusy(false);
    }
  };

  const decide = async (
    request: HrOvertimeRequest,
    status: 'approved' | 'rejected',
    comment: string,
  ): Promise<void> => {
    setDecidingId(request.id);
    setError(null);
    setSuccess(null);
    try {
      await api.decideOvertimeRequest(request.id, { status, comment });
      setSuccess(t('hr.approval.done', { defaultValue: 'Decision recorded.' }));
      overtimes.reload();
    } catch (cause) {
      setError(toHrApiError(cause));
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <HrPage
      title={t('hr.overtime.title', { defaultValue: 'Overtime requests' })}
      description={t('hr.overtime.description', {
        defaultValue:
          'Submit and approve overtime; approved hours feed the monthly total.',
      })}
    >
      <ErrorBanner error={error ?? me.error ?? overtimes.error} />
      <SuccessBanner message={success} />

      {me.data?.employee || canManage ? (
        <SectionCard
          title={t('hr.overtime.createTitle', {
            defaultValue: 'New overtime request',
          })}
        >
          <form
            className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'
            onSubmit={(event) => void submit(event)}
          >
            <Field
              label={t('hr.overtime.employee', { defaultValue: 'Employee' })}
            >
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
            <Field
              label={t('hr.overtime.date', { defaultValue: 'Overtime date' })}
            >
              <Input
                required
                type='date'
                value={form.overtimeDate}
                onChange={(event) =>
                  update({ overtimeDate: event.target.value })
                }
              />
            </Field>
            <Field label={t('hr.overtime.hours', { defaultValue: 'Hours' })}>
              <Input
                required
                type='number'
                min={0.5}
                max={24}
                step={0.5}
                value={form.hours}
                onChange={(event) => update({ hours: event.target.value })}
              />
            </Field>
            <Field label={t('hr.overtime.reason', { defaultValue: 'Reason' })}>
              <Textarea
                rows={1}
                value={form.reason}
                onChange={(event) => update({ reason: event.target.value })}
              />
            </Field>
            <div className='flex items-end'>
              <SubmitButton busy={busy}>
                {t('hr.overtime.submit', { defaultValue: 'Submit request' })}
              </SubmitButton>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title={t('hr.overtime.listTitle', {
          defaultValue: 'Overtime requests',
        })}
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
        {overtimes.loading ? <LoadingBlock /> : null}
        {!overtimes.loading && (overtimes.data ?? []).length === 0 ? (
          <EmptyBlock
            label={t('hr.overtime.empty', {
              defaultValue: 'No overtime requests.',
            })}
          />
        ) : null}
        {(overtimes.data ?? []).length > 0 ? (
          <TableShell
            head={[
              t('hr.overtime.employee', { defaultValue: 'Employee' }),
              t('hr.overtime.date', { defaultValue: 'Overtime date' }),
              t('hr.overtime.hours', { defaultValue: 'Hours' }),
              t('hr.overtime.reason', { defaultValue: 'Reason' }),
              t('hr.common.status', { defaultValue: 'Status' }),
              t('hr.approval.approver', { defaultValue: 'Approver' }),
              t('hr.approval.comment', { defaultValue: 'Approval comment' }),
              t('hr.common.actions', { defaultValue: 'Actions' }),
            ]}
          >
            {(overtimes.data ?? []).map((request) => (
              <tr key={request.id} className='border-b border-border'>
                <Td className='font-medium'>
                  {employeeName(request.employeeId)}
                </Td>
                <Td>{request.overtimeDate}</Td>
                <Td>{Number(request.hours)}</Td>
                <Td className='max-w-48 truncate'>{request.reason ?? '—'}</Td>
                <Td>
                  <StatusBadge status={request.status} />
                </Td>
                <Td>{request.approverName ?? '—'}</Td>
                <Td className='max-w-48 truncate'>
                  {request.approvalComment ?? '—'}
                </Td>
                <Td>
                  {canApprove && request.status === 'pending' ? (
                    <DecisionControls
                      busy={decidingId === request.id}
                      onDecide={(status, comment) =>
                        void decide(request, status, comment)
                      }
                    />
                  ) : null}
                </Td>
              </tr>
            ))}
          </TableShell>
        ) : null}
      </SectionCard>
    </HrPage>
  );
}
