import { useTranslation } from '@nocobase/i18n/client';
import { useNavigate } from 'react-router';
import { useService } from '@nocobase/app-client';
import { apiClientToken } from '@nocobase/app-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import type { ReactElement } from 'react';
import { useState } from 'react';

import {
  LEAVE_REQUEST_TYPES,
  errorCodeOf,
  type CreateLeaveRequestInput,
  type LeaveRequestDetailResponse,
  type LeaveRequestType,
} from '@/lib/leave-requests';

/** A datetime-local input value: `YYYY-MM-DDTHH:mm` in the browser's local timezone. */
function toDateTimeLocal(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Interpret a datetime-local value as local time and return the ISO instant. */
function fromDateTimeLocal(value: string): string {
  return new Date(value).toISOString();
}

interface ValidationErrors {
  startAt?: string;
  endAt?: string;
  days?: string;
  reason?: string;
}

export default function LeaveRequestCreatePage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const api = useService(apiClientToken);

  const [type, setType] = useState<LeaveRequestType>('personal');
  const [startAt, setStartAt] = useState<string>(() =>
    toDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  );
  const [endAt, setEndAt] = useState<string>(() =>
    toDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  );
  const [days, setDays] = useState<string>('1');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleDatesChange = (nextStart: string, nextEnd: string): void => {
    setStartAt(nextStart);
    setEndAt(nextEnd);
    setDays(
      String(
        Math.max(
          1,
          Math.round(
            (new Date(nextEnd).getTime() - new Date(nextStart).getTime()) /
              86_400_000,
          ) + 1,
        ),
      ),
    );
    setErrors((current) => ({
      ...current,
      startAt: undefined,
      endAt: undefined,
    }));
  };

  const validate = (): ValidationErrors => {
    const next: ValidationErrors = {};
    if (!startAt)
      next.startAt = t('leaveRequests.create.validation.startAtRequired');
    if (!endAt) next.endAt = t('leaveRequests.create.validation.endAtRequired');
    else if (
      startAt &&
      new Date(endAt).getTime() < new Date(startAt).getTime()
    ) {
      next.endAt = t('leaveRequests.create.validation.endBeforeStart');
    }
    const daysNumber = Number(days);
    if (
      !days ||
      Number.isNaN(daysNumber) ||
      daysNumber <= 0 ||
      daysNumber > 3650
    ) {
      next.days = t('leaveRequests.create.validation.daysRange');
    }
    if (!reason.trim()) {
      next.reason = t('leaveRequests.create.validation.reasonRequired');
    } else if (reason.trim().length > 2000) {
      next.reason = t('leaveRequests.create.validation.reasonTooLong');
    }
    return next;
  };

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;

    const input: CreateLeaveRequestInput = {
      type,
      startAt: fromDateTimeLocal(startAt),
      endAt: fromDateTimeLocal(endAt),
      days: Number(days),
      reason: reason.trim(),
    };
    setSubmitting(true);
    try {
      await api.request<LeaveRequestDetailResponse>({
        method: 'POST',
        path: 'leave-requests',
        json: input,
      });
      void navigate('/leave-requests');
    } catch (e) {
      const code = errorCodeOf(e);
      if (code === 'INVALID_INPUT') {
        const payload = e as { message?: string };
        setSubmitError(
          payload.message ??
            t('leaveRequests.create.submitError', { defaultValue: '提交失败' }),
        );
      } else {
        setSubmitError(t('leaveRequests.create.submitError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className='mx-auto w-full max-w-2xl px-6 py-10'>
      <div className='mb-6'>
        <Button
          variant='ghost'
          className='mb-3 -ml-2'
          onClick={() => void navigate('/leave-requests')}
        >
          <ArrowLeft className='size-4' />
          {t('leaveRequests.actions.backToList')}
        </Button>
        <h1 className='text-2xl font-semibold tracking-tight'>
          {t('leaveRequests.create.title')}
        </h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          {t('leaveRequests.create.description')}
        </p>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('leaveRequests.create.formTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-5'>
            <div className='space-y-2'>
              <Label htmlFor='leave-request-type'>
                {t('leaveRequests.fields.type')}
              </Label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as LeaveRequestType)}
              >
                <SelectTrigger className='w-full' id='leave-request-type'>
                  <SelectValue>{t(`leaveRequests.types.${type}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_REQUEST_TYPES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {t(`leaveRequests.types.${item}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='leave-request-start'>
                  {t('leaveRequests.fields.startAt')}
                </Label>
                <Input
                  id='leave-request-start'
                  type='datetime-local'
                  value={startAt}
                  onChange={(event) =>
                    handleDatesChange(event.target.value, endAt)
                  }
                  aria-invalid={Boolean(errors.startAt)}
                />
                {errors.startAt ? (
                  <p className='text-xs text-destructive'>{errors.startAt}</p>
                ) : null}
              </div>
              <div className='space-y-2'>
                <Label htmlFor='leave-request-end'>
                  {t('leaveRequests.fields.endAt')}
                </Label>
                <Input
                  id='leave-request-end'
                  type='datetime-local'
                  value={endAt}
                  onChange={(event) =>
                    handleDatesChange(startAt, event.target.value)
                  }
                  aria-invalid={Boolean(errors.endAt)}
                />
                {errors.endAt ? (
                  <p className='text-xs text-destructive'>{errors.endAt}</p>
                ) : null}
              </div>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='leave-request-days'>
                {t('leaveRequests.fields.days')}
              </Label>
              <Input
                id='leave-request-days'
                type='number'
                min='0.5'
                max='3650'
                step='0.5'
                value={days}
                onChange={(event) => {
                  setDays(event.target.value);
                  setErrors((current) => ({ ...current, days: undefined }));
                }}
                aria-invalid={Boolean(errors.days)}
              />
              <p className='text-xs text-muted-foreground'>
                {t('leaveRequests.create.daysHint')}
              </p>
              {errors.days ? (
                <p className='text-xs text-destructive'>{errors.days}</p>
              ) : null}
            </div>

            <div className='space-y-2'>
              <Label htmlFor='leave-request-reason'>
                {t('leaveRequests.fields.reason')}
              </Label>
              <Textarea
                id='leave-request-reason'
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setErrors((current) => ({ ...current, reason: undefined }));
                }}
                placeholder={t('leaveRequests.create.reasonPlaceholder')}
                className='min-h-28'
                aria-invalid={Boolean(errors.reason)}
              />
              {errors.reason ? (
                <p className='text-xs text-destructive'>{errors.reason}</p>
              ) : null}
            </div>

            {submitError ? (
              <p className='text-sm text-destructive'>{submitError}</p>
            ) : null}
          </CardContent>
          <CardFooter className='flex justify-end gap-2 border-t'>
            <Button
              type='button'
              variant='outline'
              onClick={() => void navigate('/leave-requests')}
            >
              {t('actions.cancel')}
            </Button>
            <Button type='submit' disabled={submitting}>
              {submitting
                ? t('leaveRequests.create.submitting')
                : t('leaveRequests.actions.submit')}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </section>
  );
}
