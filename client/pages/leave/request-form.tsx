import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router';

import { DatePicker } from '#components/date-picker';
import { RouteDialog } from '#components/route-dialog';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Textarea } from '#components/ui/textarea';
import { useSettingsLeave } from '../settings/hooks.js';
import { workingDaysBetween } from './format.js';
import type { LeaveContext } from './index.js';
import { leaveTypes, type LeaveDataResponse, type LeaveType } from './types.js';

interface Fields {
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
}

const EMPTY: Fields = {
  type: 'annual',
  startDate: '',
  endDate: '',
  reason: '',
};

function errorMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof ApiClientError) {
    if (error.reason === 'LEAVE_REQUEST_OVERLAP') {
      return t('leave.form.overlap');
    }
    if (error.reason === 'INVALID_LEAVE_DATES') {
      return t('leave.form.invalidDates');
    }
  }
  return t('leave.form.failed');
}

export default function NewLeaveRequest() {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const navigate = useNavigate();
  const location = useLocation();
  const parent = useOutletContext<LeaveContext>();
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<unknown>();
  const dirty =
    fields.startDate !== '' ||
    fields.endDate !== '' ||
    fields.reason !== '' ||
    fields.type !== 'annual';
  const leave = useSettingsLeave(dirty, busy, () => setFields(EMPTY));
  const closeTo = { pathname: '/leave', search: location.search };
  const days = workingDaysBetween(fields.startDate, fields.endDate);

  const update = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
    setServerError(undefined);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof Fields, string>> = {};
    if (!fields.startDate) {
      nextErrors.startDate = t('leave.form.startRequired');
    }
    if (!fields.endDate) {
      nextErrors.endDate = t('leave.form.endRequired');
    }
    if (
      fields.startDate &&
      fields.endDate &&
      fields.endDate < fields.startDate
    ) {
      nextErrors.endDate = t('leave.form.endBeforeStart');
    }
    if (days === 0 && fields.startDate && fields.endDate) {
      nextErrors.endDate = t('leave.form.noWorkingDays');
    }
    if (fields.reason.trim().length < 3) {
      nextErrors.reason = t('leave.form.reasonRequired');
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    setServerError(undefined);
    try {
      await api.request<LeaveDataResponse>({
        path: 'leaveRequests',
        method: 'POST',
        json: {
          type: fields.type,
          startDate: fields.startDate,
          endDate: fields.endDate,
          reason: fields.reason.trim(),
        },
      });
      parent.reload();
      leave.allow();
      toaster.show({ type: 'success', title: t('leave.form.created') });
      void navigate(closeTo);
    } catch (error) {
      setServerError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <RouteDialog
        title={t('leave.form.title')}
        description={t('leave.form.description')}
        closeTo={closeTo}
        beforeClose={leave.guard}
        footer={
          <>
            <Button
              variant='outline'
              disabled={busy}
              onClick={() => void navigate(closeTo)}
            >
              {t('leave.form.cancel')}
            </Button>
            <Button form='new-leave-request' type='submit' disabled={busy}>
              {busy ? t('leave.form.submitting') : t('leave.form.submit')}
            </Button>
          </>
        }
      >
        <form
          id='new-leave-request'
          className='flex flex-col gap-4'
          onSubmit={(event) => void submit(event)}
        >
          {serverError != null && (
            <Alert variant='destructive'>
              <AlertDescription>
                {errorMessage(serverError, t)}
              </AlertDescription>
            </Alert>
          )}
          <div className='flex flex-col gap-2'>
            <Label htmlFor='leave-type'>{t('leave.form.type')}</Label>
            <Select
              items={leaveTypes.map((value) => ({
                value,
                label: t(`leave.type.${value}`),
              }))}
              value={fields.type}
              onValueChange={(value) => update('type', value as LeaveType)}
            >
              <SelectTrigger id='leave-type' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`leave.type.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='flex flex-col gap-2'>
              <Label>{t('leave.form.startDate')}</Label>
              <DatePicker
                value={fields.startDate}
                onChange={(value) => update('startDate', value)}
                placeholder={t('leave.form.pickDate')}
                ariaLabel={t('leave.form.startDate')}
              />
              {errors.startDate && (
                <p className='text-sm text-destructive'>{errors.startDate}</p>
              )}
            </div>
            <div className='flex flex-col gap-2'>
              <Label>{t('leave.form.endDate')}</Label>
              <DatePicker
                value={fields.endDate}
                onChange={(value) => update('endDate', value)}
                placeholder={t('leave.form.pickDate')}
                ariaLabel={t('leave.form.endDate')}
              />
              {errors.endDate && (
                <p className='text-sm text-destructive'>{errors.endDate}</p>
              )}
            </div>
          </div>
          <p className='text-sm text-muted-foreground'>
            {t('leave.form.daysCount', { count: days })}
          </p>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='leave-reason'>{t('leave.form.reason')}</Label>
            <Textarea
              id='leave-reason'
              value={fields.reason}
              aria-invalid={errors.reason ? true : undefined}
              onChange={(event) => update('reason', event.target.value)}
              placeholder={t('leave.form.reasonPlaceholder')}
              rows={4}
            />
            {errors.reason && (
              <p className='text-sm text-destructive'>{errors.reason}</p>
            )}
          </div>
        </form>
      </RouteDialog>
      {leave.dialog}
    </>
  );
}
