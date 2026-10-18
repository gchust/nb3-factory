import { useTranslation } from '@nocobase/i18n/client';
import { enUS, zhCN } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { Button } from '#components/ui/button';
import { Calendar } from '#components/ui/calendar';
import { Field, FieldLabel } from '#components/ui/field';
import { Input } from '#components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#components/ui/popover';

import { formatDate } from './shared.js';

export interface DateTimeFieldProps {
  readonly id: string;
  readonly value: Date | undefined;
  readonly time: string;
  readonly invalid: boolean;
  readonly error?: string;
  readonly describedBy?: string;
  readonly onValueChange: (value: Date | undefined) => void;
  readonly onTimeChange: (value: string) => void;
}

/**
 * A due date chosen from a calendar in a popover, with the time beside it.
 * Native date inputs render differently in every browser and cannot follow the
 * application's theme, so the calendar is the primitive.
 */
export function DateTimeField({
  id,
  value,
  time,
  invalid,
  error,
  describedBy,
  onValueChange,
  onTimeChange,
}: DateTimeFieldProps): ReactElement {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const calendarLocale = i18n.language.startsWith('zh') ? zhCN : enUS;

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={`${id}-trigger`}>
        {t('todos.form.dueAtLabel')}
      </FieldLabel>
      <div className='flex gap-2'>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                id={`${id}-trigger`}
                type='button'
                variant='outline'
                aria-invalid={invalid}
                aria-describedby={describedBy}
                className='min-w-0 flex-1 justify-start font-normal'
              />
            }
          >
            <CalendarIcon aria-hidden='true' />
            <span
              className={value ? 'truncate' : 'truncate text-muted-foreground'}
            >
              {value
                ? formatDate(value, i18n.language)
                : t('todos.form.dueAtPlaceholder')}
            </span>
          </PopoverTrigger>
          <PopoverContent align='start' className='w-auto p-0'>
            <Calendar
              mode='single'
              selected={value}
              onSelect={(next) => {
                onValueChange(next);
                if (next) {
                  setOpen(false);
                }
              }}
              locale={calendarLocale}
              labels={{
                labelPrevious: () => t('todos.calendar.previousMonth'),
                labelNext: () => t('todos.calendar.nextMonth'),
              }}
              autoFocus
            />
          </PopoverContent>
        </Popover>
        <Input
          id={`${id}-time`}
          type='time'
          value={time}
          aria-label={t('todos.form.timeLabel')}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={(event) => onTimeChange(event.target.value)}
          className='w-28 shrink-0'
        />
      </div>
      {error ? (
        <p id={describedBy} className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
    </Field>
  );
}
