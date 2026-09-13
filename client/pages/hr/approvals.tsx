import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import {
  DecisionControls,
  EmptyBlock,
  ErrorBanner,
  HrPage,
  LoadingBlock,
  SectionCard,
  StatusBadge,
  SuccessBanner,
  TableShell,
  Td,
} from '@/components/hr/hr-ui.js';
import {
  toHrApiError,
  useHrApi,
  useHrQuery,
  type HrApiError,
} from '@/components/hr/hr-api.js';

export default function ApprovalsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useHrApi();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<HrApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const me = useHrQuery(() => api.getMe(), 'me');
  const employees = useHrQuery(() => api.listEmployees(), 'employees');
  const leaves = useHrQuery(
    () => api.listLeaveRequests({ status: 'pending' }),
    'pending-leaves',
  );
  const overtimes = useHrQuery(
    () => api.listOvertimeRequests({ status: 'pending' }),
    'pending-overtimes',
  );

  const canApprove = me.data?.canApprove === true;
  const employeeName = (id: number): string =>
    employees.data?.find((employee) => employee.id === id)?.name ??
    t('hr.common.unknownEmployee', { defaultValue: 'Employee #{{id}}', id });

  const decide = async (
    key: string,
    action: () => Promise<unknown>,
  ): Promise<void> => {
    setBusyId(key);
    setError(null);
    setSuccess(null);
    try {
      await action();
      setSuccess(t('hr.approval.done', { defaultValue: 'Decision recorded.' }));
      leaves.reload();
      overtimes.reload();
    } catch (cause) {
      setError(toHrApiError(cause));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <HrPage
      title={t('hr.approvals.title', { defaultValue: 'Approvals' })}
      description={t('hr.approvals.description', {
        defaultValue: 'Review pending leave and overtime requests.',
      })}
    >
      <ErrorBanner error={error ?? me.error} />
      <SuccessBanner message={success} />

      {!canApprove ? (
        <EmptyBlock
          label={t('hr.approvals.noAccess', {
            defaultValue: 'You do not have approval access.',
          })}
        />
      ) : null}

      {canApprove ? (
        <SectionCard
          title={t('hr.approvals.pendingLeave', {
            defaultValue: 'Pending leave requests',
          })}
        >
          {leaves.loading ? <LoadingBlock /> : null}
          {!leaves.loading && (leaves.data ?? []).length === 0 ? (
            <EmptyBlock
              label={t('hr.approvals.noPendingLeave', {
                defaultValue: 'No pending leave requests.',
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
                  <Td>
                    <DecisionControls
                      busy={busyId === `leave:${request.id}`}
                      onDecide={(status, comment) =>
                        void decide(`leave:${request.id}`, () =>
                          api.decideLeaveRequest(request.id, {
                            status,
                            comment,
                          }),
                        )
                      }
                    />
                  </Td>
                </tr>
              ))}
            </TableShell>
          ) : null}
        </SectionCard>
      ) : null}

      {canApprove ? (
        <SectionCard
          title={t('hr.approvals.pendingOvertime', {
            defaultValue: 'Pending overtime requests',
          })}
        >
          {overtimes.loading ? <LoadingBlock /> : null}
          {!overtimes.loading && (overtimes.data ?? []).length === 0 ? (
            <EmptyBlock
              label={t('hr.approvals.noPendingOvertime', {
                defaultValue: 'No pending overtime requests.',
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
                  <Td>
                    <DecisionControls
                      busy={busyId === `overtime:${request.id}`}
                      onDecide={(status, comment) =>
                        void decide(`overtime:${request.id}`, () =>
                          api.decideOvertimeRequest(request.id, {
                            status,
                            comment,
                          }),
                        )
                      }
                    />
                  </Td>
                </tr>
              ))}
            </TableShell>
          ) : null}
        </SectionCard>
      ) : null}
    </HrPage>
  );
}
