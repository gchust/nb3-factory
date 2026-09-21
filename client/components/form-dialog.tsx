import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { Alert, AlertDescription, AlertTitle } from './ui/alert.js';
import { Button } from './ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';
import { Input } from './ui/input.js';
import { Label } from './ui/label.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select.js';
import { Textarea } from './ui/textarea.js';
import { useLabErrorMessage } from '@/lib/lab-errors';
import {
  missingRequiredFields,
  toFormValues,
  toPayload,
  type FormFieldSpec,
  type FormValues,
} from '@/lib/lab-form';
import type { LabRequestError } from '@/lib/use-async';

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FormFieldSpec;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
}) {
  const { t } = useTranslation();
  const text = typeof value === 'string' ? value : '';

  if (field.kind === 'select') {
    const options = field.options ?? [];
    return (
      <Select
        items={options.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        value={text || null}
        onValueChange={(next) => onChange(typeof next === 'string' ? next : '')}
      >
        <SelectTrigger className='w-full'>
          <SelectValue
            placeholder={
              field.placeholderKey ? t(field.placeholderKey) : undefined
            }
          />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.kind === 'checkbox') {
    return (
      <Label className='gap-2 font-normal'>
        <input
          type='checkbox'
          className='accent-primary size-4'
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        {t(field.labelKey)}
      </Label>
    );
  }

  if (field.kind === 'textarea') {
    return (
      <Textarea
        value={text}
        rows={4}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
      />
    );
  }

  const inputType =
    field.kind === 'number'
      ? 'number'
      : field.kind === 'date'
        ? 'date'
        : field.kind === 'datetime'
          ? 'datetime-local'
          : 'text';

  return (
    <Input
      type={inputType}
      value={text}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
    />
  );
}

export interface FormDialogProps {
  readonly titleKey: string;
  readonly descriptionKey?: string;
  /** Richer description content, used in place of `descriptionKey` when provided. */
  readonly description?: ReactNode;
  readonly fields: readonly FormFieldSpec[];
  /** The record the form starts from; only the named fields are read. */
  readonly initialValues?: object | null;
  readonly submitKey?: string;
  /** Styles the submit button as a destructive action, for a confirmation. */
  readonly destructive?: boolean;
  readonly onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  readonly onClose: () => void;
}

/**
 * A modal form over a fixed set of fields.
 *
 * The dialog is mounted while it is open and unmounted when it closes, so each opening starts from
 * the record it was given without a reset effect watching for the transition.
 */
export function FormDialog({
  titleKey,
  descriptionKey,
  description,
  fields,
  initialValues,
  submitKey = 'lab.save',
  destructive = false,
  onSubmit,
  onClose,
}: FormDialogProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState<FormValues>(() =>
    toFormValues(fields, initialValues),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<LabRequestError | null>(null);
  const message = useLabErrorMessage(error);

  const missing = missingRequiredFields(fields, values);

  const submit = async () => {
    if (missing.length > 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(toPayload(fields, values));
    } catch (thrown) {
      setError(thrown as LabRequestError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !submitting) onClose();
      }}
    >
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : descriptionKey ? (
            <DialogDescription>{t(descriptionKey)}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className='flex flex-col gap-4'>
          {message ? (
            <Alert variant='destructive'>
              <AlertTitle>{t('lab.formFailed')}</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}
          {missing.length > 0 ? (
            <Alert variant='destructive'>
              <AlertDescription>
                {t('lab.requiredFields', {
                  fields: missing.map((field) => t(field.labelKey)).join(', '),
                })}
              </AlertDescription>
            </Alert>
          ) : null}
          <div className='grid gap-4 sm:grid-cols-2'>
            {fields.map((field) => (
              <div
                key={field.name}
                className={
                  field.kind === 'textarea' || field.full
                    ? 'sm:col-span-2'
                    : undefined
                }
              >
                {field.kind === 'checkbox' ? null : (
                  <Label className='mb-1.5'>
                    {t(field.labelKey)}
                    {field.required ? (
                      <span className='text-destructive'>*</span>
                    ) : null}
                  </Label>
                )}
                <FieldControl
                  field={field}
                  value={values[field.name] ?? ''}
                  onChange={(next) =>
                    setValues((previous) => ({
                      ...previous,
                      [field.name]: next,
                    }))
                  }
                />
                {field.helpKey ? (
                  <p className='text-muted-foreground mt-1 text-xs'>
                    {t(field.helpKey)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={submitting}>
            {t('lab.cancel')}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => void submit()}
            disabled={submitting || missing.length > 0}
          >
            {t(submitKey)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
