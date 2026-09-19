import { useTranslation } from '@nocobase/i18n/client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import {
  addMonths,
  isSameMonth,
  monthGrid,
  startOfMonth,
  toDateKey,
} from './format.js';
import { NativeSelect } from './shared.js';

/**
 * An in-document date and time control.
 *
 * The browser's native `<input type="datetime-local">` picker is rendered
 * outside the document, so interacting with it inside a modal dialog reads as
 * an outside press and dismisses the dialog. This control keeps every part of
 * the interaction in the React tree: an inline month grid plus hour and minute
 * selects. Its value uses the same `YYYY-MM-DDTHH:mm` shape as the native
 * input, so callers can keep calling `new Date(value).toISOString()`.
 */

const HOURS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, '0'),
);

const MINUTES = Array.from({ length: 12 }, (_, index) =>
  String(index * 5).padStart(2, '0'),
);

interface ParsedValue {
  readonly date: Date | null;
  readonly hour: string;
  readonly minute: string;
}

function parseValue(value: string): ParsedValue {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return { date: null, hour: '09', minute: '00' };
  return {
    date: new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    hour: match[4],
    minute: match[5],
  };
}

function compose(date: Date, hour: string, minute: string): string {
  return `${toDateKey(date)}T${hour}:${minute}`;
}

export function DateTimeField({
  label,
  value,
  onChange,
  disabled,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const parsed = parseValue(value);
  const [month, setMonth] = useState(() =>
    startOfMonth(parsed.date ?? new Date()),
  );
  const days = useMemo(() => monthGrid(month), [month]);
  const selectedKey = parsed.date ? toDateKey(parsed.date) : '';
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(
          new Date(2024, 0, 1 + index),
        ),
      ),
    [i18n.language],
  );

  function chooseDay(day: Date): void {
    onChange(compose(day, parsed.hour, parsed.minute));
  }

  function chooseHour(hour: string): void {
    onChange(compose(parsed.date ?? new Date(), hour, parsed.minute));
  }

  function chooseMinute(minute: string): void {
    onChange(compose(parsed.date ?? new Date(), parsed.hour, minute));
  }

  return (
    <div className='flex flex-col gap-1.5 text-sm'>
      <span className='font-medium text-foreground'>{label}</span>
      <div className='space-y-2 rounded-lg border border-input p-2'>
        <div className='flex items-center justify-between gap-1'>
          <Button
            aria-label={t('recruitment.interviews.previousMonth')}
            disabled={disabled}
            onClick={() => setMonth(addMonths(month, -1))}
            size='icon-sm'
            type='button'
            variant='ghost'
          >
            <ChevronLeft className='size-4' />
          </Button>
          <span className='text-xs font-medium'>
            {new Intl.DateTimeFormat(i18n.language, {
              year: 'numeric',
              month: 'long',
            }).format(month)}
          </span>
          <Button
            aria-label={t('recruitment.interviews.nextMonth')}
            disabled={disabled}
            onClick={() => setMonth(addMonths(month, 1))}
            size='icon-sm'
            type='button'
            variant='ghost'
          >
            <ChevronRight className='size-4' />
          </Button>
        </div>
        <div className='grid grid-cols-7 text-center text-[10px] font-medium text-muted-foreground'>
          {weekdayLabels.map((weekday) => (
            <span className='py-1' key={weekday}>
              {weekday}
            </span>
          ))}
        </div>
        <div className='grid grid-cols-7 gap-0.5'>
          {days.map((day) => {
            const key = toDateKey(day);
            const inMonth = isSameMonth(day, month);
            return (
              <button
                aria-label={key}
                aria-pressed={key === selectedKey}
                className={cn(
                  'flex h-7 items-center justify-center rounded-md text-xs transition-colors disabled:cursor-not-allowed',
                  inMonth ? 'text-foreground' : 'text-muted-foreground',
                  key === selectedKey
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted',
                )}
                disabled={disabled}
                key={key}
                onClick={() => chooseDay(day)}
                type='button'
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
        <div className='flex items-center gap-2'>
          <NativeSelect
            ariaLabel={t('recruitment.interviews.hour')}
            disabled={disabled}
            onChange={chooseHour}
            value={parsed.hour}
          >
            {HOURS.map((hour) => (
              <option key={hour} value={hour}>
                {hour}
              </option>
            ))}
          </NativeSelect>
          <span className='text-muted-foreground'>:</span>
          <NativeSelect
            ariaLabel={t('recruitment.interviews.minute')}
            disabled={disabled}
            onChange={chooseMinute}
            value={parsed.minute}
          >
            {MINUTES.map((minute) => (
              <option key={minute} value={minute}>
                {minute}
              </option>
            ))}
          </NativeSelect>
          <span className='ml-auto text-xs text-muted-foreground'>
            {value
              ? value.replace('T', ' ')
              : t('recruitment.interviews.timeUnset')}
          </span>
        </div>
      </div>
    </div>
  );
}
