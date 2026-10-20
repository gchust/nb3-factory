import { format, parseISO } from 'date-fns';
import { enUS, zhCN } from 'react-day-picker/locale';
import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { Button } from '#components/ui/button';
import { Calendar } from '#components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#components/ui/popover';
import { cn } from 'cn';

export interface DatePickerProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly disabled?: boolean;
  readonly ariaLabel?: string;
  readonly className?: string;
}

/**
 * A calendar-date field. It reads and writes the ISO day string the API uses
 * (`YYYY-MM-DD`), so the form value and the stored value are the same and no
 * time-zone conversion can move a leave day.
 */
export function DatePicker({
  value,
  onChange,
  placeholder,
  disabled,
  ariaLabel,
  className,
}: DatePickerProps) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;
  const locale = i18n.language.toLowerCase().startsWith('zh') ? zhCN : enUS;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='outline'
            disabled={disabled}
            aria-label={ariaLabel ?? placeholder}
            className={cn(
              'w-full justify-start font-normal',
              !value && 'text-muted-foreground',
              className,
            )}
          />
        }
      >
        <CalendarIcon data-icon='inline-start' />
        {selected ? format(selected, 'PPP', { locale }) : placeholder}
      </PopoverTrigger>
      <PopoverContent align='start' className='w-auto p-0'>
        <Calendar
          mode='single'
          selected={selected}
          defaultMonth={selected}
          locale={locale}
          onSelect={(next) => {
            if (!next) return;
            onChange(format(next, 'yyyy-MM-dd'));
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
