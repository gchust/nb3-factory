import type { ReactElement, ReactNode } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

/** One choice in an `EnumSelect`; `null` is the empty choice. */
export interface EnumOption {
  readonly label: string;
  readonly value: string | null;
}

export interface TextFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?:
    'text' | 'number' | 'email' | 'tel' | 'url' | 'date' | 'datetime-local';
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly description?: string;
}

/** A labelled single-line input, wired to the `Field` primitives. */
export function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
  disabled,
  error,
  description,
}: TextFieldProps): ReactElement {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>
        {label}
        {required ? <span aria-hidden='true'>*</span> : null}
      </FieldLabel>
      <Input
        aria-invalid={error ? true : undefined}
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={error ? [{ message: error }] : undefined} />
    </Field>
  );
}

export interface TextareaFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly rows?: number;
  readonly disabled?: boolean;
  readonly error?: string;
}

/** A labelled multi-line input. */
export function TextareaField({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled,
  error,
}: TextareaFieldProps): ReactElement {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        aria-invalid={error ? true : undefined}
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        value={value}
      />
      <FieldError errors={error ? [{ message: error }] : undefined} />
    </Field>
  );
}

export interface EnumSelectProps {
  readonly id: string;
  readonly label: string;
  readonly value: string | null;
  readonly items: readonly EnumOption[];
  readonly onChange: (value: string | null) => void;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly description?: string;
}

/** A labelled select over a fixed set of string choices. */
export function EnumSelect({
  id,
  label,
  value,
  items,
  onChange,
  disabled,
  error,
  description,
}: EnumSelectProps): ReactElement {
  const selectItems = items.map((item) => ({
    label: item.label,
    value: item.value,
  }));
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        disabled={disabled}
        items={selectItems}
        onValueChange={(next) => onChange(next ?? null)}
        value={value}
      >
        <SelectTrigger aria-invalid={error ? true : undefined} id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value ?? '__empty'} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={error ? [{ message: error }] : undefined} />
    </Field>
  );
}

export interface InlineEnumSelectProps {
  readonly value: string | null;
  readonly items: readonly EnumOption[];
  readonly onChange: (value: string | null) => void;
  readonly disabled?: boolean;
  readonly ariaLabel: string;
  readonly className?: string;
}

/** A borderless select for a table cell, with no visible label. */
export function InlineEnumSelect({
  value,
  items,
  onChange,
  disabled,
  ariaLabel,
  className,
}: InlineEnumSelectProps): ReactElement {
  return (
    <Select
      disabled={disabled}
      items={items}
      onValueChange={(next) => onChange(next ?? null)}
      value={value}
    >
      <SelectTrigger aria-label={ariaLabel} className={className} size='sm'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value ?? '__empty'} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export interface CheckboxFieldProps {
  readonly id: string;
  readonly label: ReactNode;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
}

/** A labelled checkbox. */
export function CheckboxField({
  id,
  label,
  checked,
  onChange,
  disabled,
}: CheckboxFieldProps): ReactElement {
  return (
    <Field orientation='horizontal'>
      <Checkbox
        checked={checked}
        disabled={disabled}
        id={id}
        onCheckedChange={(next) => onChange(next === true)}
      />
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
    </Field>
  );
}
