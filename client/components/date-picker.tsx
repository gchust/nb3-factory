'use client';

import { format, type Locale } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import { Calendar } from '#components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#components/ui/popover';
import { cn } from 'cn';

export interface DatePickerProps {
  readonly id?: string;
  readonly className?: string;
  /** The chosen day, or `undefined` while nothing is chosen. */
  readonly value: Date | undefined;
  readonly onChange: (date: Date | undefined) => void;
  /** The `date-fns` locale the trigger and the calendar render in; defaults to English. */
  readonly locale?: Locale;
  readonly placeholder?: string;
  readonly disabled?: boolean;
}

/**
 * A date field: a button showing the chosen day that opens a calendar in a popover.
 *
 * Composed here from the `calendar` and `popover` primitives, as shadcn's Date Picker guide does, so pages never fall
 * back to a native date input. It accepts neither `ref` nor `aria-invalid`; the field's `FieldError` below it carries
 * the error instead.
 */
export function DatePicker({
  id,
  className,
  value,
  onChange,
  locale,
  placeholder,
  disabled,
}: DatePickerProps): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type='button'
            variant='outline'
            disabled={disabled}
            data-empty={value === undefined}
            className={cn(
              'w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground',
              className,
            )}
          />
        }
      >
        <CalendarIcon aria-hidden='true' />
        {value ? format(value, 'PP', { locale }) : placeholder}
      </PopoverTrigger>
      <PopoverContent align='start' className='w-auto p-2'>
        <Calendar
          mode='single'
          locale={locale}
          selected={value}
          defaultMonth={value}
          onSelect={(date) => {
            onChange(date ?? undefined);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
