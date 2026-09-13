import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ErrorBanner,
  EmptyBlock,
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
  type HrEmployee,
} from '@/components/hr/hr-api.js';

interface EmployeeForm {
  name: string;
  employeeNo: string;
  departmentId: string;
  position: string;
  hireDate: string;
  status: string;
  annualLeaveDays: string;
}

const EMPTY_FORM: EmployeeForm = {
  name: '',
  employeeNo: '',
  departmentId: '',
  position: '',
  hireDate: '',
  status: 'active',
  annualLeaveDays: '0',
};

export default function EmployeesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useHrApi();
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<HrEmployee | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<HrApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const me = useHrQuery(() => api.getMe(), 'me');
  const departments = useHrQuery(() => api.listDepartments(), 'departments');
  const employees = useHrQuery(
    () =>
      api.listEmployees({
        departmentId: departmentFilter ? Number(departmentFilter) : undefined,
      }),
    `employees:${departmentFilter}`,
  );

  const canManage = me.data?.canManage === true;

  const update = (patch: Partial<EmployeeForm>): void =>
    setForm((current) => ({ ...current, ...patch }));

  const reset = (): void => {
    setForm(EMPTY_FORM);
    setEditing(null);
  };

  const startEdit = (employee: HrEmployee): void => {
    setEditing(employee);
    setForm({
      name: employee.name,
      employeeNo: employee.employeeNo,
      departmentId: employee.departmentId ? String(employee.departmentId) : '',
      position: employee.position ?? '',
      hireDate: employee.hireDate ?? '',
      status: employee.status,
      annualLeaveDays: String(employee.annualLeaveDays),
    });
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    const payload = {
      name: form.name,
      employeeNo: form.employeeNo,
      departmentId: form.departmentId ? Number(form.departmentId) : null,
      position: form.position || null,
      hireDate: form.hireDate || null,
      status: form.status,
      annualLeaveDays: Number(form.annualLeaveDays || 0),
    };
    try {
      if (editing) {
        await api.updateEmployee(editing.id, payload);
        setSuccess(
          t('hr.employees.updated', { defaultValue: 'Employee updated.' }),
        );
      } else {
        await api.createEmployee(payload);
        setSuccess(
          t('hr.employees.created', { defaultValue: 'Employee created.' }),
        );
      }
      reset();
      employees.reload();
    } catch (cause) {
      setError(toHrApiError(cause));
    } finally {
      setBusy(false);
    }
  };

  const departmentName = (id: number | null): string => {
    if (id === null) return t('hr.common.none', { defaultValue: '—' });
    return (
      departments.data?.find((department) => department.id === id)?.name ?? '—'
    );
  };

  return (
    <HrPage
      title={t('hr.employees.title', { defaultValue: 'Employees' })}
      description={t('hr.employees.description', {
        defaultValue: 'Maintain employee records and annual leave entitlement.',
      })}
    >
      <ErrorBanner error={error ?? me.error ?? employees.error} />
      <SuccessBanner message={success} />

      {canManage ? (
        <SectionCard
          title={
            editing
              ? t('hr.employees.editTitle', { defaultValue: 'Edit employee' })
              : t('hr.employees.createTitle', {
                  defaultValue: 'New employee',
                })
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
            <Field label={t('hr.employees.name', { defaultValue: 'Name' })}>
              <Input
                required
                value={form.name}
                onChange={(event) => update({ name: event.target.value })}
              />
            </Field>
            <Field
              label={t('hr.employees.employeeNo', {
                defaultValue: 'Employee number',
              })}
            >
              <Input
                required
                value={form.employeeNo}
                onChange={(event) => update({ employeeNo: event.target.value })}
              />
            </Field>
            <Field
              label={t('hr.employees.department', {
                defaultValue: 'Department',
              })}
            >
              <NativeSelect
                value={form.departmentId}
                onChange={(event) =>
                  update({ departmentId: event.target.value })
                }
              >
                <option value=''>
                  {t('hr.common.none', { defaultValue: '—' })}
                </option>
                {(departments.data ?? []).map((department) => (
                  <option key={department.id} value={String(department.id)}>
                    {department.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label={t('hr.employees.position', { defaultValue: 'Position' })}
            >
              <Input
                value={form.position}
                onChange={(event) => update({ position: event.target.value })}
              />
            </Field>
            <Field
              label={t('hr.employees.hireDate', { defaultValue: 'Hire date' })}
            >
              <Input
                type='date'
                value={form.hireDate}
                onChange={(event) => update({ hireDate: event.target.value })}
              />
            </Field>
            <Field label={t('hr.employees.status', { defaultValue: 'Status' })}>
              <NativeSelect
                value={form.status}
                onChange={(event) => update({ status: event.target.value })}
              >
                <option value='active'>
                  {t('hr.employeeStatus.active', { defaultValue: 'Active' })}
                </option>
                <option value='inactive'>
                  {t('hr.employeeStatus.inactive', {
                    defaultValue: 'Inactive',
                  })}
                </option>
              </NativeSelect>
            </Field>
            <Field
              label={t('hr.employees.annualLeaveDays', {
                defaultValue: 'Annual leave days',
              })}
            >
              <Input
                type='number'
                min={0}
                step={1}
                value={form.annualLeaveDays}
                onChange={(event) =>
                  update({ annualLeaveDays: event.target.value })
                }
              />
            </Field>
            <div className='flex items-end'>
              <SubmitButton busy={busy}>
                {editing
                  ? t('actions.save', { defaultValue: 'Save' })
                  : t('hr.employees.create', { defaultValue: 'Add employee' })}
              </SubmitButton>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title={t('hr.employees.listTitle', { defaultValue: 'Employee list' })}
        actions={
          <div className='w-56'>
            <NativeSelect
              aria-label={t('hr.employees.filterByDepartment', {
                defaultValue: 'Filter by department',
              })}
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
            >
              <option value=''>
                {t('hr.employees.allDepartments', {
                  defaultValue: 'All departments',
                })}
              </option>
              {(departments.data ?? []).map((department) => (
                <option key={department.id} value={String(department.id)}>
                  {department.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        }
      >
        {employees.loading ? <LoadingBlock /> : null}
        {!employees.loading && (employees.data ?? []).length === 0 ? (
          <EmptyBlock
            label={t('hr.employees.empty', { defaultValue: 'No employees.' })}
          />
        ) : null}
        {(employees.data ?? []).length > 0 ? (
          <TableShell
            head={[
              t('hr.employees.name', { defaultValue: 'Name' }),
              t('hr.employees.employeeNo', { defaultValue: 'Employee number' }),
              t('hr.employees.department', { defaultValue: 'Department' }),
              t('hr.employees.position', { defaultValue: 'Position' }),
              t('hr.employees.hireDate', { defaultValue: 'Hire date' }),
              t('hr.employees.status', { defaultValue: 'Status' }),
              t('hr.employees.annualLeaveDays', {
                defaultValue: 'Annual leave days',
              }),
              '',
            ]}
          >
            {(employees.data ?? []).map((employee) => (
              <tr key={employee.id} className='border-b border-border'>
                <Td className='font-medium'>{employee.name}</Td>
                <Td>{employee.employeeNo}</Td>
                <Td>{departmentName(employee.departmentId)}</Td>
                <Td>{employee.position ?? '—'}</Td>
                <Td>{employee.hireDate ?? '—'}</Td>
                <Td>
                  <StatusBadge status={employee.status} />
                </Td>
                <Td>{employee.annualLeaveDays}</Td>
                <Td>
                  {canManage ? (
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => startEdit(employee)}
                    >
                      {t('actions.edit', { defaultValue: 'Edit' })}
                    </Button>
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
