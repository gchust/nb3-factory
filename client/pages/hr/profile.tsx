/**
 * My profile: the signed-in employee's own record, including the identity and
 * contract details that only they and HR may see.
 *
 * The server returns the full record for the person themselves, so this page
 * shows whatever it receives and never has to decide confidentiality.
 */
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import type { ReactElement, ReactNode } from 'react';

import { DataTable } from '@/components/data-table/index.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageContainer } from '@/components/page-container.js';
import { PageHeader } from '@/components/page-header.js';
import { useApiData } from '@/hooks/use-api-data.js';

import { fetchLeaveRequests, fetchMyEmployee } from './api.js';
import type { HrLeaveRequest } from './types.js';
import {
  EmptyState,
  EmployeeStatusBadge,
  FieldValue,
  HrErrorState,
  HrLoading,
  LeaveStatusBadge,
} from './ui.js';

function DetailRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='grid grid-cols-[9rem_1fr] gap-2 border-b py-2 text-sm last:border-b-0'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='min-w-0 break-words'>{children}</span>
    </div>
  );
}

export default function HrProfilePage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const employee = useApiData('hr.me', (signal) =>
    fetchMyEmployee(api, signal),
  );
  const leave = useApiData('hr.profile.leave', (signal) =>
    fetchLeaveRequests(api, { mine: true }, signal),
  );

  const columns: ColumnDef<HrLeaveRequest>[] = [
    {
      accessorKey: 'type',
      header: t('hr.leave.type'),
      cell: ({ row }) => t(`hr.leave.types.${row.original.type}`),
    },
    { accessorKey: 'startDate', header: t('hr.leave.startDate') },
    { accessorKey: 'endDate', header: t('hr.leave.endDate') },
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
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('hr.profile.title')}
        description={t('hr.profile.description')}
      />

      {employee.loading ? <HrLoading rows={3} /> : null}
      {employee.error ? (
        <HrErrorState error={employee.error} onRetry={employee.reload} />
      ) : null}

      {employee.data ? (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-3'>
              {employee.data.name}
              <EmployeeStatusBadge status={employee.data.status} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow label={t('hr.employees.employeeNo')}>
              <FieldValue value={employee.data.employeeNo} />
            </DetailRow>
            <DetailRow label={t('hr.employees.department')}>
              <FieldValue value={employee.data.departmentTitle} />
            </DetailRow>
            <DetailRow label={t('hr.employees.position')}>
              <FieldValue value={employee.data.position} />
            </DetailRow>
            <DetailRow label={t('hr.employees.hireDate')}>
              <FieldValue value={employee.data.hireDate} />
            </DetailRow>
            <DetailRow label={t('hr.employees.email')}>
              <FieldValue value={employee.data.email} />
            </DetailRow>
            <DetailRow label={t('hr.employees.phone')}>
              <FieldValue value={employee.data.phone} />
            </DetailRow>
            <DetailRow label={t('hr.employees.idNumber')}>
              <FieldValue value={employee.data.idNumber} />
            </DetailRow>
            <DetailRow label={t('hr.employees.contractNo')}>
              <FieldValue value={employee.data.contractNo} />
            </DetailRow>
            <DetailRow label={t('hr.employees.contractStart')}>
              <FieldValue value={employee.data.contractStartDate} />
            </DetailRow>
            <DetailRow label={t('hr.employees.contractEnd')}>
              <FieldValue value={employee.data.contractEndDate} />
            </DetailRow>
            <DetailRow label={t('hr.employees.notes')}>
              <FieldValue value={employee.data.notes} />
            </DetailRow>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('hr.profile.myLeave')}</CardTitle>
        </CardHeader>
        <CardContent>
          {leave.loading ? <HrLoading rows={3} /> : null}
          {leave.error ? (
            <HrErrorState error={leave.error} onRetry={leave.reload} />
          ) : null}
          {leave.data ? (
            leave.data.length === 0 ? (
              <EmptyState message={t('hr.leave.empty')} />
            ) : (
              <DataTable
                columns={columns}
                data={leave.data}
                showSelectedCount={false}
                emptyMessage={t('hr.leave.empty')}
              />
            )
          ) : null}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
