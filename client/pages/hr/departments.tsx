/**
 * Departments: the list HR manages, and the create/edit dialog.
 *
 * A supervisor may open the page (it is in their permission set) but the
 * server refuses every write, so the management controls are shown only when
 * the dashboard reports HR; a refusal still surfaces as a plain error.
 */
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/data-table/index.js';
import type { ColumnDef } from '@tanstack/react-table';
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
  createDepartment,
  fetchDepartments,
  fetchDashboard,
  fetchEmployees,
  updateDepartment,
  type DepartmentInput,
} from './api.js';
import type { HrDepartment } from './types.js';
import { HrErrorState, HrLoading } from './ui.js';

interface DepartmentFormState {
  title: string;
  code: string;
  description: string;
  managerId: string;
  active: boolean;
  sortOrder: string;
}

const EMPTY_FORM: DepartmentFormState = {
  title: '',
  code: '',
  description: '',
  managerId: '',
  active: true,
  sortOrder: '0',
};

function toInput(form: DepartmentFormState): DepartmentInput {
  return {
    title: form.title.trim(),
    code: form.code.trim() || undefined,
    description: form.description.trim() || undefined,
    managerId: form.managerId || undefined,
    active: form.active,
    sortOrder: form.sortOrder ? Number(form.sortOrder) : 0,
  };
}

function DepartmentDialog({
  open,
  department,
  managers,
  onOpenChange,
  onSaved,
}: {
  readonly open: boolean;
  readonly department?: HrDepartment;
  readonly managers: readonly { readonly id: string; readonly name: string }[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [form, setForm] = useState<DepartmentFormState>(() =>
    department
      ? {
          title: department.title,
          code: department.code ?? '',
          description: department.description ?? '',
          managerId: department.managerId ?? '',
          active: department.active,
          sortOrder: String(department.sortOrder),
        }
      : EMPTY_FORM,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = (): void => {
    if (!form.title.trim()) {
      setError(t('hr.departments.titleRequired'));
      return;
    }
    setPending(true);
    setError(undefined);
    const action = department
      ? updateDepartment(api, department.id, toInput(form))
      : createDepartment(api, toInput(form));
    action.then(
      () => {
        setPending(false);
        toaster.show({ type: 'success', title: t('hr.departments.saved') });
        onOpenChange(false);
        onSaved();
      },
      () => {
        setPending(false);
        setError(t('hr.error.requestFailedDescription'));
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {department ? t('hr.departments.edit') : t('hr.departments.create')}
          </DialogTitle>
          <DialogDescription>
            {t('hr.departments.formDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <div className='grid gap-2'>
            <Label htmlFor='department-title'>
              {t('hr.departments.title')}
            </Label>
            <Input
              id='department-title'
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='department-code'>{t('hr.departments.code')}</Label>
            <Input
              id='department-code'
              value={form.code}
              onChange={(event) =>
                setForm({ ...form, code: event.target.value })
              }
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='department-manager'>
              {t('hr.departments.manager')}
            </Label>
            <select
              id='department-manager'
              className='border-input bg-background h-8 rounded-lg border px-2 text-sm'
              value={form.managerId}
              onChange={(event) =>
                setForm({ ...form, managerId: event.target.value })
              }
            >
              <option value=''>{t('hr.departments.noManager')}</option>
              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.name}
                </option>
              ))}
            </select>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='department-order'>
              {t('hr.departments.sortOrder')}
            </Label>
            <Input
              id='department-order'
              type='number'
              value={form.sortOrder}
              onChange={(event) =>
                setForm({ ...form, sortOrder: event.target.value })
              }
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='department-description'>
              {t('hr.departments.description')}
            </Label>
            <Textarea
              id='department-description'
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </div>
          <label className='flex items-center gap-2 text-sm'>
            <input
              type='checkbox'
              checked={form.active}
              onChange={(event) =>
                setForm({ ...form, active: event.target.checked })
              }
            />
            {t('hr.departments.active')}
          </label>
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('hr.actions.cancel')}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? t('hr.actions.saving') : t('hr.actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function HrDepartmentsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [editing, setEditing] = useState<HrDepartment>();
  const [dialogOpen, setDialogOpen] = useState(false);

  const dashboard = useApiData('hr.dashboard', (signal) =>
    fetchDashboard(api, signal),
  );
  const departments = useApiData('hr.departments', (signal) =>
    fetchDepartments(api, signal),
  );
  const employees = useApiData('hr.employees', (signal) =>
    fetchEmployees(api, {}, signal),
  );

  const managers = (employees.data ?? [])
    .filter((employee) => employee.userId)
    .map((employee) => ({ id: employee.userId!, name: employee.name }));

  const columns: ColumnDef<HrDepartment>[] = [
    {
      accessorKey: 'title',
      header: t('hr.departments.title'),
    },
    {
      accessorKey: 'code',
      header: t('hr.departments.code'),
    },
    {
      id: 'manager',
      header: t('hr.departments.manager'),
      cell: ({ row }) =>
        managers.find((manager) => manager.id === row.original.managerId)
          ?.name ?? '—',
    },
    {
      accessorKey: 'description',
      header: t('hr.departments.description'),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          variant='ghost'
          size='sm'
          onClick={() => {
            setEditing(row.original);
            setDialogOpen(true);
          }}
        >
          {t('hr.actions.edit')}
        </Button>
      ),
    },
  ];

  const isHr = dashboard.data?.isHr ?? false;

  return (
    <PageContainer>
      <PageHeader
        title={t('hr.departments.title')}
        description={t('hr.departments.description')}
        actions={
          isHr ? (
            <Button
              onClick={() => {
                setEditing(undefined);
                setDialogOpen(true);
              }}
            >
              <PlusIcon />
              {t('hr.departments.create')}
            </Button>
          ) : null
        }
      />
      <Card>
        <CardContent>
          {departments.loading ? <HrLoading rows={4} /> : null}
          {departments.error ? (
            <HrErrorState
              error={departments.error}
              onRetry={departments.reload}
            />
          ) : null}
          {departments.data ? (
            <DataTable
              columns={columns}
              data={departments.data}
              showSelectedCount={false}
              emptyMessage={t('hr.departments.empty')}
            />
          ) : null}
        </CardContent>
      </Card>
      {dialogOpen ? (
        <DepartmentDialog
          open
          department={editing}
          managers={managers}
          onOpenChange={setDialogOpen}
          onSaved={departments.reload}
        />
      ) : null}{' '}
    </PageContainer>
  );
}
