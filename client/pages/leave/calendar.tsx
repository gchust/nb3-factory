import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, useState } from 'react';

import { Button } from '#components/ui/button';
import { Card } from '#components/ui/card';
import { cn } from 'cn';
import { apiPath, useLeaveResource } from './data.js';
import { isoDay } from './format.js';
import type { LeaveRequest } from './types.js';

interface CalendarResponse {
  readonly data: LeaveRequest[];
  readonly meta: { readonly month: string; readonly total: number };
}

/**
 * A month of approved team leave. It is deliberately a read-only grid: this page
 * answers “who is away when”, while submitting and deciding happen in the list
 * and the detail view.
 */
export function LeaveCalendar() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const dateLocale = language.toLowerCase().startsWith('zh') ? zhCN : enUS;
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const resource = useLeaveResource<CalendarResponse>(
    apiPath('leaveRequests/calendar', { month }),
    { keepPreviousData: true },
  );
  const monthDate = parseISO(`${month}-01`);
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [monthDate]);
  const weekdays = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    return eachDayOfInterval({
      start,
      end: addDays(start, 6),
    }).map((day) =>
      new Intl.DateTimeFormat(language, { weekday: 'short' }).format(day),
    );
  }, [language]);
  const byDay = useMemo(() => {
    const result = new Map<string, LeaveRequest[]>();
    for (const request of resource.data?.data ?? []) {
      for (const day of days) {
        const dayIso = isoDay(day);
        if (dayIso < request.startDate || dayIso > request.endDate) continue;
        const list = result.get(dayIso) ?? [];
        list.push(request);
        result.set(dayIso, list);
      }
    }
    return result;
  }, [days, resource.data]);

  return (
    <Card className='gap-0 py-0'>
      <div className='flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3'>
        <div>
          <h2 className='font-heading text-base font-medium'>
            {format(monthDate, 'LLLL yyyy', { locale: dateLocale })}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('leave.calendar.hint')}
          </p>
        </div>
        <div className='flex items-center gap-1'>
          <Button
            variant='outline'
            size='icon-sm'
            aria-label={t('leave.calendar.previous')}
            onClick={() =>
              setMonth(format(addMonths(monthDate, -1), 'yyyy-MM'))
            }
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setMonth(format(new Date(), 'yyyy-MM'))}
          >
            {t('leave.calendar.today')}
          </Button>
          <Button
            variant='outline'
            size='icon-sm'
            aria-label={t('leave.calendar.next')}
            onClick={() => setMonth(format(addMonths(monthDate, 1), 'yyyy-MM'))}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
      <div className='overflow-x-auto p-4'>
        <div className='min-w-[44rem]'>
          <div className='grid grid-cols-7 border-b pb-1'>
            {weekdays.map((weekday) => (
              <div
                key={weekday}
                className='px-2 text-center text-xs font-medium text-muted-foreground'
              >
                {weekday}
              </div>
            ))}
          </div>
          <div className='grid grid-cols-7'>
            {days.map((day) => {
              const key = isoDay(day);
              const entries = byDay.get(key) ?? [];
              const outside = !isSameMonth(day, monthDate);
              return (
                <div
                  key={key}
                  className={cn(
                    'min-h-24 border-r border-b p-1.5 last:border-r-0',
                    outside && 'bg-muted/40 text-muted-foreground',
                  )}
                >
                  <div
                    className={cn(
                      'mb-1 flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
                      isSameDay(day, new Date()) &&
                        'bg-primary font-semibold text-primary-foreground',
                    )}
                  >
                    {format(day, 'd')}
                  </div>
                  <div className='flex flex-col gap-1'>
                    {entries.slice(0, 3).map((request) => (
                      <div
                        key={request.id}
                        title={`${request.userName} · ${t(`leave.type.${request.type}`)}`}
                        className='truncate rounded bg-primary/10 px-1.5 py-0.5 text-[11px] leading-4 text-primary'
                      >
                        {request.userName}
                      </div>
                    ))}
                    {entries.length > 3 && (
                      <span className='px-1 text-[11px] text-muted-foreground'>
                        {t('leave.calendar.more', {
                          count: entries.length - 3,
                        })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {resource.loading && (
        <p className='border-t px-4 py-2 text-sm text-muted-foreground'>
          {t('leave.loading')}
        </p>
      )}
      {resource.error != null && (
        <p className='border-t px-4 py-2 text-sm text-destructive'>
          {t('leave.loadError')}
        </p>
      )}
    </Card>
  );
}
