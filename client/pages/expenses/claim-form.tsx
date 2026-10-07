import { useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';

import { DatePicker } from '@/components/date-picker';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
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
import {
  clientFileRepositoryManagerToken,
  FileUploadField,
} from '@/extensions/nocobase-file-component-ui';
import { cn } from '@/lib/utils';

import { formatAmount, parseDay, toDayString } from './claim-format.js';
import {
  EXPENSE_INVOICE_REPOSITORY,
  claimFormTotal,
  newClaimFormItem,
  type ClaimFormItem,
  type ClaimFormProps,
  type ClaimFormValues,
} from './claim-form-model.js';
import {
  EXPENSE_CATEGORIES,
  FINANCE_REVIEW_THRESHOLD,
  MAX_INVOICE_SIZE,
} from './types.js';

export function ClaimForm({
  values,
  onChange,
  departments,
  disabled = false,
  errors,
  defaultDepartmentName,
}: ClaimFormProps): ReactElement {
  const { t } = useTranslation();
  const files = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => files.repository(EXPENSE_INVOICE_REPOSITORY),
    [files],
  );

  function patch(next: Partial<ClaimFormValues>): void {
    onChange({ ...values, ...next });
  }

  function patchItem(index: number, next: Partial<ClaimFormItem>): void {
    patch({
      items: values.items.map((item, position) =>
        position === index ? { ...item, ...next } : item,
      ),
    });
  }

  function moveItem(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= values.items.length) {
      return;
    }
    const items = [...values.items];
    const [moving] = items.splice(index, 1);
    items.splice(target, 0, moving);
    patch({ items });
  }

  const categoryItems = EXPENSE_CATEGORIES.map((category) => ({
    value: category,
    label: t(`expense.category.${category}`),
  }));

  const departmentItems = [
    {
      value: 'auto',
      label: defaultDepartmentName
        ? t('expense.form.departmentDefault', { name: defaultDepartmentName })
        : t('expense.form.departmentDefaultUnset'),
    },
    ...departments.map((department) => ({
      value: department.id,
      label: department.name,
    })),
  ];

  const total = claimFormTotal(values.items);

  return (
    <div className='space-y-6'>
      <FieldGroup>
        <Field data-invalid={errors?.title ? 'true' : undefined}>
          <FieldLabel htmlFor='claim-title'>
            {t('expense.fields.title')}
          </FieldLabel>
          <Input
            id='claim-title'
            value={values.title}
            disabled={disabled}
            maxLength={255}
            placeholder={t('expense.form.titlePlaceholder')}
            onChange={(event) => patch({ title: event.target.value })}
          />
          <FieldDescription>{t('expense.form.titleHint')}</FieldDescription>
          {errors?.title ? (
            <FieldError>{t('expense.form.titleRequired')}</FieldError>
          ) : null}
        </Field>
        <Field>
          <FieldLabel>{t('expense.fields.department')}</FieldLabel>
          <Select
            items={departmentItems}
            value={values.departmentId || 'auto'}
            disabled={disabled}
            onValueChange={(value) =>
              patch({ departmentId: !value || value === 'auto' ? '' : value })
            }
          >
            <SelectTrigger className='w-full sm:max-w-xs'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {departmentItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            {t('expense.form.departmentHint')}
          </FieldDescription>
        </Field>
        <Field data-invalid={errors?.items ? 'true' : undefined}>
          <FieldLabel htmlFor='claim-remark'>
            {t('expense.fields.remark')}
          </FieldLabel>
          <Textarea
            id='claim-remark'
            value={values.remark}
            disabled={disabled}
            maxLength={2000}
            rows={3}
            placeholder={t('expense.form.remarkPlaceholder')}
            onChange={(event) => patch({ remark: event.target.value })}
          />
          {errors?.items ? (
            <FieldError>{t('expense.form.itemsRequired')}</FieldError>
          ) : null}
        </Field>
      </FieldGroup>

      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <h2 className='text-base font-medium'>{t('expense.form.items')}</h2>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={disabled}
            onClick={() =>
              patch({ items: [...values.items, newClaimFormItem()] })
            }
          >
            <PlusIcon data-icon='inline-start' />
            {t('expense.form.addItem')}
          </Button>
        </div>

        {values.items.length === 0 ? (
          <p className='rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground'>
            {t('expense.form.noItems')}
          </p>
        ) : (
          <ul className='space-y-4'>
            {values.items.map((item, index) => {
              const lineError = errors?.line?.[index];
              return (
                <li key={item.key} className='rounded-xl border bg-card p-4'>
                  <div className='mb-4 flex items-center justify-between gap-2'>
                    <span className='text-sm font-medium text-muted-foreground'>
                      {t('expense.form.itemNumber', { index: index + 1 })}
                    </span>
                    <div className='flex items-center gap-1'>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-sm'
                        disabled={disabled || index === 0}
                        aria-label={t('expense.form.moveUp')}
                        onClick={() => moveItem(index, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-sm'
                        disabled={disabled || index === values.items.length - 1}
                        aria-label={t('expense.form.moveDown')}
                        onClick={() => moveItem(index, 1)}
                      >
                        ↓
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-sm'
                        disabled={disabled}
                        aria-label={t('expense.form.removeItem')}
                        onClick={() =>
                          patch({
                            items: values.items.filter(
                              (_, position) => position !== index,
                            ),
                          })
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </div>

                  <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                    <Field
                      data-invalid={lineError?.category ? 'true' : undefined}
                    >
                      <FieldLabel>{t('expense.fields.category')}</FieldLabel>
                      <Select
                        items={categoryItems}
                        value={item.category || undefined}
                        disabled={disabled}
                        onValueChange={(value) =>
                          patchItem(index, {
                            category:
                              EXPENSE_CATEGORIES.find(
                                (category) => category === value,
                              ) ?? '',
                          })
                        }
                      >
                        <SelectTrigger
                          className='w-full'
                          aria-label={t('expense.fields.category')}
                        >
                          <SelectValue
                            placeholder={t('expense.form.chooseCategory')}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {categoryItems.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {lineError?.category ? (
                        <FieldError>
                          {t('expense.form.categoryRequired')}
                        </FieldError>
                      ) : null}
                    </Field>
                    <Field
                      data-invalid={lineError?.amount ? 'true' : undefined}
                    >
                      <FieldLabel htmlFor={`claim-amount-${item.key}`}>
                        {t('expense.fields.amount')}
                      </FieldLabel>
                      <Input
                        id={`claim-amount-${item.key}`}
                        type='number'
                        inputMode='decimal'
                        min='0.01'
                        step='0.01'
                        disabled={disabled}
                        value={item.amount}
                        onChange={(event) =>
                          patchItem(index, { amount: event.target.value })
                        }
                      />
                      {lineError?.amount ? (
                        <FieldError>
                          {t('expense.form.amountRequired')}
                        </FieldError>
                      ) : null}
                    </Field>
                    <Field>
                      <FieldLabel>{t('expense.fields.expenseDate')}</FieldLabel>
                      <DatePicker
                        className='w-full'
                        value={parseDay(item.expenseDate)}
                        disabled={disabled}
                        placeholder={t('expense.form.expenseDatePlaceholder')}
                        onChange={(date) =>
                          patchItem(index, {
                            expenseDate: toDayString(date) ?? '',
                          })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`claim-description-${item.key}`}>
                        {t('expense.fields.description')}
                      </FieldLabel>
                      <Input
                        id={`claim-description-${item.key}`}
                        value={item.description}
                        disabled={disabled}
                        maxLength={500}
                        onChange={(event) =>
                          patchItem(index, { description: event.target.value })
                        }
                      />
                    </Field>
                  </div>

                  <Field className='mt-4'>
                    <FieldLabel>{t('expense.fields.invoice')}</FieldLabel>
                    <FileUploadField
                      repository={repository}
                      value={item.invoices}
                      disabled={disabled}
                      maxSize={MAX_INVOICE_SIZE}
                      accept={[
                        'image/*',
                        '.pdf',
                        '.doc',
                        '.docx',
                        '.xls',
                        '.xlsx',
                      ]}
                      labels={{
                        choose: t('expense.form.chooseInvoice'),
                        empty: t('expense.form.noInvoice'),
                        remove: t('expense.form.removeInvoice'),
                        preview: t('expense.form.previewInvoice'),
                        download: t('expense.form.downloadInvoice'),
                        retry: t('expense.form.retryInvoice'),
                      }}
                      onChange={(invoices) => patchItem(index, { invoices })}
                    />
                    <FieldDescription>
                      {t('expense.form.invoiceHint', { size: '10 MB' })}
                    </FieldDescription>
                  </Field>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div
        className={cn(
          'flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3',
        )}
      >
        <span className='text-sm text-muted-foreground'>
          {t('expense.form.total')}
        </span>
        <span className='text-lg font-semibold tabular-nums'>
          {formatAmount(total)}
        </span>
      </div>
      <p className='text-sm text-muted-foreground'>
        {t('expense.form.thresholdHint', {
          amount: formatAmount(FINANCE_REVIEW_THRESHOLD),
        })}
      </p>
    </div>
  );
}
