import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import {
  EmptyBlock,
  ErrorBanner,
  HrPage,
  LoadingBlock,
  SectionCard,
  TableShell,
  Td,
} from '@/components/hr/hr-ui.js';
import { useHrApi, useHrQuery } from '@/components/hr/hr-api.js';

export default function StatisticsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useHrApi();
  const me = useHrQuery(() => api.getMe(), 'me');
  const statistics = useHrQuery(() => api.getStatistics(), 'statistics');

  const canView = me.data?.canApprove === true;
  const data = statistics.data;

  return (
    <HrPage
      title={t('hr.statistics.title', { defaultValue: 'HR statistics' })}
      description={t('hr.statistics.description', {
        defaultValue:
          'Leave days by department, remaining annual leave, and this month overtime.',
      })}
    >
      <ErrorBanner error={statistics.error ?? me.error} />

      {me.data && !canView ? (
        <EmptyBlock
          label={t('hr.statistics.noAccess', {
            defaultValue: 'You do not have access to HR statistics.',
          })}
        />
      ) : null}

      {canView ? (
        <>
          <SectionCard
            title={t('hr.statistics.overtimeThisMonth', {
              defaultValue: 'Overtime hours this month',
            })}
          >
            {statistics.loading ? <LoadingBlock /> : null}
            {!statistics.loading ? (
              <div className='flex items-baseline gap-2'>
                <span
                  data-testid='overtime-hours'
                  className='font-heading text-3xl font-semibold'
                >
                  {data?.overtimeHoursThisMonth ?? 0}
                </span>
                <span className='text-sm text-muted-foreground'>
                  {t('hr.statistics.month', {
                    defaultValue: 'Month: {{month}}',
                    month: data?.month ?? '—',
                  })}
                </span>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title={t('hr.statistics.departmentLeave', {
              defaultValue: 'Leave days by department',
            })}
          >
            {statistics.loading ? <LoadingBlock /> : null}
            {!statistics.loading && (data?.departments ?? []).length === 0 ? (
              <EmptyBlock
                label={t('hr.statistics.empty', {
                  defaultValue: 'No data yet.',
                })}
              />
            ) : null}
            {(data?.departments ?? []).length > 0 ? (
              <TableShell
                head={[
                  t('hr.statistics.department', { defaultValue: 'Department' }),
                  t('hr.statistics.leaveDays', {
                    defaultValue: 'Total leave days',
                  }),
                  t('hr.statistics.overtimeHours', {
                    defaultValue: 'Overtime hours this month',
                  }),
                ]}
              >
                {(data?.departments ?? []).map((row) => (
                  <tr
                    key={`${row.departmentId ?? 'none'}`}
                    className='border-b border-border'
                  >
                    <Td className='font-medium'>
                      {row.departmentName ||
                        t('hr.statistics.unassigned', {
                          defaultValue: 'Unassigned',
                        })}
                    </Td>
                    <Td>{row.leaveDays}</Td>
                    <Td>{row.overtimeHours}</Td>
                  </tr>
                ))}
              </TableShell>
            ) : null}
          </SectionCard>

          <SectionCard
            title={t('hr.statistics.employeeAnnual', {
              defaultValue: 'Remaining annual leave by employee',
            })}
          >
            {statistics.loading ? <LoadingBlock /> : null}
            {!statistics.loading && (data?.employees ?? []).length === 0 ? (
              <EmptyBlock
                label={t('hr.statistics.empty', {
                  defaultValue: 'No data yet.',
                })}
              />
            ) : null}
            {(data?.employees ?? []).length > 0 ? (
              <TableShell
                head={[
                  t('hr.employees.name', { defaultValue: 'Name' }),
                  t('hr.employees.employeeNo', {
                    defaultValue: 'Employee number',
                  }),
                  t('hr.employees.department', { defaultValue: 'Department' }),
                  t('hr.statistics.entitlement', {
                    defaultValue: 'Annual entitlement',
                  }),
                  t('hr.statistics.used', { defaultValue: 'Used' }),
                  t('hr.statistics.remaining', { defaultValue: 'Remaining' }),
                ]}
              >
                {(data?.employees ?? []).map((row) => (
                  <tr key={row.employeeId} className='border-b border-border'>
                    <Td className='font-medium'>{row.employeeName}</Td>
                    <Td>{row.employeeNo}</Td>
                    <Td>{row.departmentName || '—'}</Td>
                    <Td>{row.annualLeaveDays}</Td>
                    <Td>{row.usedAnnualLeaveDays}</Td>
                    <Td data-testid={`remaining-${row.employeeId}`}>
                      {row.remainingAnnualLeaveDays}
                    </Td>
                  </tr>
                ))}
              </TableShell>
            ) : null}
          </SectionCard>
        </>
      ) : null}
    </HrPage>
  );
}
