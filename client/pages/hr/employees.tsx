/**
 * Employees: the list an HR person manages and a supervisor sees their own
 * department in, with a create dialog, an edit dialog, and a detail dialog that
 * offers onboarding (opens an account) and offboarding (disables it).
 *
 * Field confidentiality is not a client rule: the server returns the full
 * record only to HR and to the person themselves, so this page renders
 * whatever it receives.
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageContainer } from '@/components/page-container.js';
import { PageHeader } from '@/components/page-header.js';
import { useApiData } from '@/hooks/use-api-data.js';

import {
  changeEmployeeLifecycle,
  createEmployee,
  fetchDashboard,
  fetchDepartments,
  fetchEmployee,
  fetchEmployees,
  updateEmployee,
  type EmployeeInput,
} from './api.js';
import {
  EMPLOYEE_STATUSES,
  type EmployeeStatus,
  type HrEmployee,
} from './types.js';
import {
  EmployeeStatusBadge,
  EmptyState,
  FieldValue,
  HrErrorState,
  HrLoading,
} from './ui.js';

function toDate(value: string | null | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function toIso(value: Date | undefined): string | undefined {
  return value ? value.toISOString().slice(0, 10) : undefined;
}

interface EmployeeFormProps {
  readonly employee?: HrEmployee;
  readonly departments: readonly {
    readonly id: number;
    readonly title: string;
  }[];
  readonly onSaved: (employee: HrEmployee) => void;
  readonly onCancel: () => void;
}

function EmployeeForm({
  employee,
  departments,
  onSaved,
  onCancel,
}: EmployeeFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [name, setName] = useState(employee?.name ?? '');
  const [employeeNo, setEmployeeNo] = useState(employee?.employeeNo ?? '');
  const [email, setEmail] = useState(employee?.email ?? '');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [position, setPosition] = useState(employee?.position ?? '');
  const [departmentId, setDepartmentId] = useState(
    employee?.departmentId ? String(employee.departmentId) : '',
  );
  const [status, setStatus] = useState<EmployeeStatus>(
    employee?.status ?? 'onboarding',
  );
  const [hireDate, setHireDate] = useState(() => toDate(employee?.hireDate));
  const [idNumber, setIdNumber] = useState(employee?.idNumber ?? '');
  const [contractNo, setContractNo] = useState(employee?.contractNo ?? '');
  const [contractStart, setContractStart] = useState(() =>
    toDate(employee?.contractStartDate),
  );
  const [contractEnd, setContractEnd] = useState(() =>
    toDate(employee?.contractEndDate),
  );
  const [notes, setNotes] = useState(employee?.notes ?? '');
  const [openAccount, setOpenAccount] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = (): void => {
    if (!name.trim()) {
      setError(t('hr.employees.nameRequired'));
      return;
    }
    const input: EmployeeInput = {
      name: name.trim(),
      employeeNo: employeeNo.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      position: position.trim() || undefined,
      departmentId: departmentId ? Number(departmentId) : null,
      hireDate: toIso(hireDate),
      idNumber: idNumber.trim() || undefined,
      contractNo: contractNo.trim() || undefined,
      contractStartDate: toIso(contractStart),
      contractEndDate: toIso(contractEnd),
      notes: notes.trim() || undefined,
      ...(employee ? { status } : { openAccount }),
    };
    setPending(true);
    setError(undefined);
    const action = employee
      ? updateEmployee(api, employee.id, input)
      : createEmployee(api, input);
    action.then(
      (saved) => {
        setPending(false);
        toaster.show({ type: 'success', title: t('hr.employees.saved') });
        onSaved(saved);
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
          {employee ? t('hr.employees.edit') : t('hr.employees.create')}
        </DialogTitle>
        <DialogDescription>
          {t('hr.employees.formDescription')}
        </DialogDescription>
      </DialogHeader>
      <div className='grid max-h-[60vh] gap-4 overflow-y-auto pr-1 sm:grid-cols-2'>
        <div className='grid gap-2'>
          <Label htmlFor='employee-name'>{t('hr.employees.name')}</Label>
          <Input
            id='employee-name'
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className='grid gap-2'>
          <Label htmlFor='employee-no'>{t('hr.employees.employeeNo')}</Label>
          <Input
            id='employee-no'
            value={employeeNo}
            onChange={(e) => setEmployeeNo(e.target.value)}
          />
        </div>
        <div className='grid gap-2'>
          <Label htmlFor='employee-email'>{t('hr.employees.email')}</Label>
          <Input
            id='employee-email'
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className='grid gap-2'>
          <Label htmlFor='employee-phone'>{t('hr.employees.phone')}</Label>
          <Input
            id='employee-phone'
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className='grid gap-2'>
          <Label htmlFor='employee-department'>
            {t('hr.employees.department')}
          </Label>
          <select
            id='employee-department'
            className='border-input bg-background h-8 rounded-lg border px-2 text-sm'
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value=''>{t('hr.employees.noDepartment')}</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.title}
              </option>
            ))}
          </select>
        </div>
        <div className='grid gap-2'>
          <Label htmlFor='employee-position'>
            {t('hr.employees.position')}
          </Label>
          <Input
            id='employee-position'
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />
        </div>
        {employee ? (
          <div className='grid gap-2'>
            <Label htmlFor='employee-status'>{t('hr.employees.status')}</Label>
            <select
              id='employee-status'
              className='border-input bg-background h-8 rounded-lg border px-2 text-sm'
              value={status}
              onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
            >
              {EMPLOYEE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`hr.status.employee.${value}`)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className='grid gap-2'>
          <Label>{t('hr.employees.hireDate')}</Label>
          <DatePicker value={hireDate} onChange={setHireDate} />
        </div>
        <div className='grid gap-2'>
          <Label htmlFor='employee-id-number'>
            {t('hr.employees.idNumber')}
          </Label>
          <Input
            id='employee-id-number'
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
          />
        </div>
        <div className='grid gap-2'>
          <Label htmlFor='employee-contract-no'>
            {t('hr.employees.contractNo')}
          </Label>
          <Input
            id='employee-contract-no'
            value={contractNo}
            onChange={(e) => setContractNo(e.target.value)}
          />
        </div>
        <div className='grid gap-2'>
          <Label>{t('hr.employees.contractStart')}</Label>
          <DatePicker value={contractStart} onChange={setContractStart} />
        </div>
        <div className='grid gap-2'>
          <Label>{t('hr.employees.contractEnd')}</Label>
          <DatePicker value={contractEnd} onChange={setContractEnd} />
        </div>
        <div className='grid gap-2 sm:col-span-2'>
          <Label htmlFor='employee-notes'>{t('hr.employees.notes')}</Label>
          <Textarea
            id='employee-notes'
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {employee ? null : (
          <label className='flex items-center gap-2 text-sm sm:col-span-2'>
            <input
              type='checkbox'
              checked={openAccount}
              onChange={(e) => setOpenAccount(e.target.checked)}
            />
            {t('hr.employees.openAccount')}
          </label>
        )}
        {error ? (
          <p className='text-sm text-destructive sm:col-span-2'>{error}</p>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant='outline' onClick={onCancel}>
          {t('hr.actions.cancel')}
        </Button>
        <Button onClick={submit} disabled={pending}>
          {pending ? t('hr.actions.saving') : t('hr.actions.save')}
        </Button>
      </DialogFooter>
    </>
  );
}

function DetailRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): ReactElement {
  return (
    <div className='grid grid-cols-[9rem_1fr] gap-2 py-1 text-sm'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='min-w-0 break-words'>{children}</span>
    </div>
  );
}

function EmployeeDetailDialog({
  employeeId,
  departments,
  isHr,
  onClose,
  onChanged,
}: {
  readonly employeeId: number;
  readonly departments: readonly {
    readonly id: number;
    readonly title: string;
  }[];
  readonly isHr: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const employee = useApiData(`hr.employee.${employeeId}`, (signal) =>
    fetchEmployee(api, employeeId, signal),
  );

  const lifecycle = (action: 'onboard' | 'offboard'): void => {
    setBusy(true);
    changeEmployeeLifecycle(api, employeeId, action).then(
      () => {
        setBusy(false);
        toaster.show({
          type: 'success',
          title:
            action === 'onboard'
              ? t('hr.employees.onboarded')
              : t('hr.employees.offboarded'),
        });
        employee.reload();
        onChanged();
      },
      () => {
        setBusy(false);
        toaster.show({
          type: 'error',
          title: t('hr.error.requestFailedDescription'),
        });
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className='sm:max-w-lg'>
        {editing && employee.data ? (
          <EmployeeForm
            employee={employee.data}
            departments={departments}
            onSaved={() => {
              setEditing(false);
              employee.reload();
              onChanged();
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {employee.data ? employee.data.name : t('hr.employees.detail')}
              </DialogTitle>
              <DialogDescription>
                {employee.data?.position ?? t('hr.employees.detailDescription')}
              </DialogDescription>
            </DialogHeader>
            {employee.loading ? <HrLoading rows={4} /> : null}
            {employee.error ? (
              <HrErrorState error={employee.error} onRetry={employee.reload} />
            ) : null}
            {employee.data ? (
              <div className='divide-y'>
                <DetailRow label={t('hr.employees.employeeNo')}>
                  <FieldValue value={employee.data.employeeNo} />
                </DetailRow>
                <DetailRow label={t('hr.employees.department')}>
                  <FieldValue value={employee.data.departmentTitle} />
                </DetailRow>
                <DetailRow label={t('hr.employees.status')}>
                  <EmployeeStatusBadge status={employee.data.status} />
                </DetailRow>
                {employee.data.userId !== undefined ? (
                  <>
                    <DetailRow label={t('hr.employees.email')}>
                      <FieldValue value={employee.data.email} />
                    </DetailRow>
                    <DetailRow label={t('hr.employees.phone')}>
                      <FieldValue value={employee.data.phone} />
                    </DetailRow>
                    <DetailRow label={t('hr.employees.hireDate')}>
                      <FieldValue value={employee.data.hireDate} />
                    </DetailRow>
                    <DetailRow label={t('hr.employees.idNumber')}>
                      <FieldValue value={employee.data.idNumber} />
                    </DetailRow>
                    <DetailRow label={t('hr.employees.contractNo')}>
                      <FieldValue value={employee.data.contractNo} />
                    </DetailRow>
                    <DetailRow label={t('hr.employees.contractDates')}>
                      <FieldValue
                        value={
                          employee.data.contractStartDate ||
                          employee.data.contractEndDate
                            ? `${employee.data.contractStartDate ?? '—'} ~ ${
                                employee.data.contractEndDate ?? '—'
                              }`
                            : null
                        }
                      />
                    </DetailRow>
                    <DetailRow label={t('hr.employees.notes')}>
                      <FieldValue value={employee.data.notes} />
                    </DetailRow>
                  </>
                ) : null}
              </div>
            ) : null}
            {isHr && employee.data ? (
              <DialogFooter>
                {employee.data.status === 'offboarded' ? (
                  <Button
                    variant='outline'
                    disabled={busy}
                    onClick={() => lifecycle('onboard')}
                  >
                    {t('hr.employees.onboard')}
                  </Button>
                ) : (
                  <Button
                    variant='outline'
                    disabled={busy}
                    onClick={() => lifecycle('offboard')}
                  >
                    {t('hr.employees.offboard')}
                  </Button>
                )}
                <Button onClick={() => setEditing(true)}>
                  {t('hr.actions.edit')}
                </Button>
              </DialogFooter>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function HrEmployeesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [status, setStatus] = useState<'' | EmployeeStatus>('');
  const [departmentId, setDepartmentId] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number>();
  const [creating, setCreating] = useState(false);

  const dashboard = useApiData('hr.dashboard', (signal) =>
    fetchDashboard(api, signal),
  );
  const departments = useApiData('hr.departments', (signal) =>
    fetchDepartments(api, signal),
  );
  const employees = useApiData(
    `hr.employees:${status}:${departmentId}:${search}`,
    (signal) =>
      fetchEmployees(
        api,
        {
          status: status || undefined,
          departmentId: departmentId ? Number(departmentId) : undefined,
          search: search || undefined,
        },
        signal,
      ),
  );

  const isHr = dashboard.data?.isHr ?? false;
  const departmentOptions = (departments.data ?? []).map((department) => ({
    id: department.id,
    title: department.title,
  }));

  const columns: ColumnDef<HrEmployee>[] = [
    { accessorKey: 'employeeNo', header: t('hr.employees.employeeNo') },
    { accessorKey: 'name', header: t('hr.employees.name') },
    {
      accessorKey: 'departmentTitle',
      header: t('hr.employees.department'),
      cell: ({ row }) => <FieldValue value={row.original.departmentTitle} />,
    },
    {
      accessorKey: 'position',
      header: t('hr.employees.position'),
      cell: ({ row }) => <FieldValue value={row.original.position} />,
    },
    {
      accessorKey: 'status',
      header: t('hr.employees.status'),
      cell: ({ row }) => <EmployeeStatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          variant='ghost'
          size='sm'
          onClick={() => setSelectedId(row.original.id)}
        >
          {t('hr.actions.view')}
        </Button>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('hr.employees.title')}
        description={t('hr.employees.description')}
        actions={
          isHr ? (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon />
              {t('hr.employees.create')}
            </Button>
          ) : null
        }
      />

      <div className='flex flex-wrap items-center gap-2'>
        <Input
          className='max-w-xs'
          placeholder={t('hr.employees.searchPlaceholder')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className='border-input bg-background h-8 rounded-lg border px-2 text-sm'
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as '' | EmployeeStatus)
          }
        >
          <option value=''>{t('hr.employees.allStatuses')}</option>
          {EMPLOYEE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`hr.status.employee.${value}`)}
            </option>
          ))}
        </select>
        <select
          className='border-input bg-background h-8 rounded-lg border px-2 text-sm'
          value={departmentId}
          onChange={(event) => setDepartmentId(event.target.value)}
        >
          <option value=''>{t('hr.employees.allDepartments')}</option>
          {departmentOptions.map((department) => (
            <option key={department.id} value={department.id}>
              {department.title}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <CardContent>
          {employees.loading ? <HrLoading rows={5} /> : null}
          {employees.error ? (
            <HrErrorState error={employees.error} onRetry={employees.reload} />
          ) : null}
          {employees.data ? (
            employees.data.length === 0 ? (
              <EmptyState message={t('hr.employees.empty')} />
            ) : (
              <DataTable
                columns={columns}
                data={employees.data}
                showSelectedCount={false}
                emptyMessage={t('hr.employees.empty')}
              />
            )
          ) : null}
        </CardContent>
      </Card>

      {creating ? (
        <Dialog
          open
          onOpenChange={(open) => (open ? undefined : setCreating(false))}
        >
          <DialogContent className='sm:max-w-2xl'>
            <EmployeeForm
              departments={departmentOptions}
              onSaved={() => {
                setCreating(false);
                employees.reload();
              }}
              onCancel={() => setCreating(false)}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {selectedId !== undefined ? (
        <EmployeeDetailDialog
          employeeId={selectedId}
          departments={departmentOptions}
          isHr={isHr}
          onClose={() => setSelectedId(undefined)}
          onChanged={employees.reload}
        />
      ) : null}
    </PageContainer>
  );
}
