import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  EmptyBlock,
  ErrorBanner,
  Field,
  HrPage,
  LoadingBlock,
  NativeSelect,
  SectionCard,
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
  type HrDepartment,
} from '@/components/hr/hr-api.js';

export default function DepartmentsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useHrApi();
  const [name, setName] = useState('');
  const [managerId, setManagerId] = useState('');
  const [editing, setEditing] = useState<HrDepartment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<HrApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const me = useHrQuery(() => api.getMe(), 'me');
  const departments = useHrQuery(() => api.listDepartments(), 'departments');
  const canManage = me.data?.canManage === true;
  const employees = useHrQuery(
    () => (canManage ? api.listEmployees() : Promise.resolve([])),
    `employees-for-departments:${canManage}`,
  );

  const reset = (): void => {
    setName('');
    setManagerId('');
    setEditing(null);
  };

  const startEdit = (department: HrDepartment): void => {
    setEditing(department);
    setName(department.name);
    setManagerId(department.managerId ? String(department.managerId) : '');
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    const payload = {
      name,
      managerId: managerId ? Number(managerId) : null,
    };
    try {
      if (editing) {
        await api.updateDepartment(editing.id, payload);
        setSuccess(
          t('hr.departments.updated', { defaultValue: 'Department updated.' }),
        );
      } else {
        await api.createDepartment(payload);
        setSuccess(
          t('hr.departments.created', { defaultValue: 'Department created.' }),
        );
      }
      reset();
      departments.reload();
    } catch (cause) {
      setError(toHrApiError(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <HrPage
      title={t('hr.departments.title', { defaultValue: 'Departments' })}
      description={t('hr.departments.description', {
        defaultValue: 'Maintain departments and their person in charge.',
      })}
    >
      <ErrorBanner error={error ?? me.error ?? departments.error} />
      <SuccessBanner message={success} />

      {canManage ? (
        <SectionCard
          title={
            editing
              ? t('hr.departments.editTitle', {
                  defaultValue: 'Edit department',
                })
              : t('hr.departments.createTitle', {
                  defaultValue: 'New department',
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
            className='grid grid-cols-1 gap-3 sm:grid-cols-3'
            onSubmit={(event) => void submit(event)}
          >
            <Field label={t('hr.departments.name', { defaultValue: 'Name' })}>
              <Input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field
              label={t('hr.departments.manager', {
                defaultValue: 'Person in charge',
              })}
            >
              <NativeSelect
                value={managerId}
                onChange={(event) => setManagerId(event.target.value)}
              >
                <option value=''>
                  {t('hr.common.none', { defaultValue: '—' })}
                </option>
                {(employees.data ?? []).map((employee) => (
                  <option key={employee.id} value={String(employee.id)}>
                    {employee.name} ({employee.employeeNo})
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className='flex items-end'>
              <SubmitButton busy={busy}>
                {editing
                  ? t('actions.save', { defaultValue: 'Save' })
                  : t('hr.departments.create', {
                      defaultValue: 'Add department',
                    })}
              </SubmitButton>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title={t('hr.departments.listTitle', {
          defaultValue: 'Department list',
        })}
      >
        {departments.loading ? <LoadingBlock /> : null}
        {!departments.loading && (departments.data ?? []).length === 0 ? (
          <EmptyBlock
            label={t('hr.departments.empty', {
              defaultValue: 'No departments.',
            })}
          />
        ) : null}
        {(departments.data ?? []).length > 0 ? (
          <TableShell
            head={[
              t('hr.departments.name', { defaultValue: 'Name' }),
              t('hr.departments.manager', {
                defaultValue: 'Person in charge',
              }),
              '',
            ]}
          >
            {(departments.data ?? []).map((department) => (
              <tr key={department.id} className='border-b border-border'>
                <Td className='font-medium'>{department.name}</Td>
                <Td>
                  {department.managerName ??
                    t('hr.common.none', { defaultValue: '—' })}
                </Td>
                <Td>
                  {canManage ? (
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => startEdit(department)}
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
