import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ChevronRight, Plus } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';

import { EmployeeForm } from '@/components/employee-records/employee-form.js';
import { employeeErrorMessage } from '@/components/employee-records/error-message.js';
import {
  listEmployees,
  type Employee,
} from '@/components/employee-records/api.js';
import { Loading } from '@/components/loading';
import { Button } from '@/components/ui/button';

export default function EmployeesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const [employees, setEmployees] = useState<readonly Employee[] | undefined>();
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(() => {
    setError('');
    setEmployees(undefined);
    listEmployees(api).then(
      (data) => setEmployees(data),
      (cause) => setError(employeeErrorMessage(t, cause)),
    );
  }, [api, t]);

  useEffect(() => {
    let active = true;
    listEmployees(api).then(
      (data) => {
        if (active) setEmployees(data);
      },
      (cause) => {
        if (active) setError(employeeErrorMessage(t, cause));
      },
    );
    return () => {
      active = false;
    };
  }, [api, t]);

  return (
    <section className='mx-auto w-full max-w-4xl space-y-6 p-6'>
      <header className='flex flex-wrap items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='font-heading text-2xl font-semibold'>
            {t('employees.title')}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {t('employees.description')}
          </p>
        </div>
        <Button onClick={() => setShowForm((value) => !value)}>
          <Plus />
          {t('employees.new')}
        </Button>
      </header>

      {showForm ? (
        <EmployeeForm
          onCancel={() => setShowForm(false)}
          onCreated={(employee) => {
            setEmployees((current) => [employee, ...(current ?? [])]);
            setShowForm(false);
          }}
        />
      ) : null}

      {error ? (
        <div className='space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4'>
          <p className='text-sm text-destructive' role='alert'>
            {error}
          </p>
          <Button size='sm' variant='outline' onClick={reload}>
            {t('employees.retry')}
          </Button>
        </div>
      ) : null}

      {!error && employees === undefined ? (
        <Loading label={t('employees.loading')} />
      ) : null}

      {!error && employees && employees.length === 0 ? (
        <p className='rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground'>
          {t('employees.empty')}
        </p>
      ) : null}

      {!error && employees && employees.length > 0 ? (
        <ul className='space-y-2'>
          {employees.map((employee) => (
            <li key={employee.id}>
              <Link
                className='flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted'
                to={`/employees/${employee.id}`}
              >
                <span className='min-w-0 space-y-0.5'>
                  <span className='block font-medium'>{employee.name}</span>
                  <span className='block text-sm text-muted-foreground'>
                    {employee.employeeNo} · {employee.department}
                  </span>
                </span>
                <ChevronRight className='size-4 shrink-0 text-muted-foreground' />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
