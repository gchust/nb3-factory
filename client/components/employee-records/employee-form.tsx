import { useTranslation } from '@nocobase/i18n/client';
import { type FormEvent, type ReactElement, useState } from 'react';
import { apiClientToken, useService } from '@nocobase/app-client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { createEmployee, type Employee } from './api.js';
import { employeeErrorMessage } from './error-message.js';

export interface EmployeeFormProps {
  readonly onCreated: (employee: Employee) => void;
  readonly onCancel: () => void;
}

export function EmployeeForm({
  onCreated,
  onCancel,
}: EmployeeFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const [name, setName] = useState('');
  const [employeeNo, setEmployeeNo] = useState('');
  const [department, setDepartment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const employee = await createEmployee(api, {
        name,
        employeeNo,
        department,
      });
      onCreated(employee);
    } catch (cause) {
      setError(employeeErrorMessage(t, cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className='space-y-4 rounded-lg border border-border bg-card p-4'
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className='grid gap-4 sm:grid-cols-3'>
        <div className='space-y-1.5'>
          <Label htmlFor='employee-name'>{t('employees.form.name')}</Label>
          <Input
            id='employee-name'
            required
            maxLength={255}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='employee-no'>{t('employees.form.employeeNo')}</Label>
          <Input
            id='employee-no'
            required
            maxLength={64}
            value={employeeNo}
            onChange={(event) => setEmployeeNo(event.target.value)}
          />
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='employee-department'>
            {t('employees.form.department')}
          </Label>
          <Input
            id='employee-department'
            required
            maxLength={255}
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          />
        </div>
      </div>
      {error ? (
        <p className='text-sm text-destructive' role='alert'>
          {error}
        </p>
      ) : null}
      <div className='flex gap-2'>
        <Button disabled={submitting} type='submit'>
          {submitting ? t('employees.form.saving') : t('actions.save')}
        </Button>
        <Button
          disabled={submitting}
          type='button'
          variant='outline'
          onClick={onCancel}
        >
          {t('actions.cancel')}
        </Button>
      </div>
    </form>
  );
}
