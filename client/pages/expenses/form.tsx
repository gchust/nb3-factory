import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useRouteOverlay } from '@/components/use-route-overlay';

import {
  createExpenseReport,
  fetchExpenseMeta,
  fetchExpenseReport,
  updateExpenseReport,
  type ExpenseItemInput,
  type ExpenseMeta,
} from './api.js';
import { formatAmount } from './constants.js';
import { expenseErrorMessage } from './errors.js';
import { invalidateExpenseData } from './refresh.js';
import { Notice } from './shared.jsx';

interface FormItem {
  id: string;
  categoryId: string;
  expenseDate: string;
  amount: string;
  description: string;
}

function emptyItem(): FormItem {
  return {
    id: crypto.randomUUID(),
    categoryId: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    amount: '',
    description: '',
  };
}

export function ExpenseReportForm({
  reportId,
}: {
  readonly reportId?: string;
}): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  const [meta, setMeta] = useState<ExpenseMeta>();
  const [purpose, setPurpose] = useState('');
  const [items, setItems] = useState<readonly FormItem[]>(() => [emptyItem()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const metaResult = await fetchExpenseMeta(api);
        if (controller.signal.aborted) return;
        setMeta(metaResult);
        if (reportId) {
          const detail = await fetchExpenseReport(api, reportId);
          if (controller.signal.aborted) return;
          setPurpose(detail.report.purpose ?? '');
          setItems(
            detail.items.map((item) => ({
              id: item.id,
              categoryId: item.categoryId,
              expenseDate: item.expenseDate,
              amount: String(item.amount),
              description: item.description ?? '',
            })),
          );
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(
            expenseErrorMessage(caught, t('expenses.form.loadFailed'), t),
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [api, reportId, t]);

  const total = items.reduce((sum, item) => {
    const value = Number(item.amount);
    return sum + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);

  function updateItem(index: number, patch: Partial<FormItem>): void {
    setItems((current) =>
      current.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    );
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError(undefined);
    if (items.length === 0) {
      setError(t('expenses.form.itemsRequired'));
      return;
    }
    for (const item of items) {
      if (!item.categoryId) {
        setError(t('expenses.form.categoryRequired'));
        return;
      }
      if (!item.expenseDate) {
        setError(t('expenses.form.dateRequired'));
        return;
      }
      const amount = Number(item.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setError(t('expenses.form.amountRequired'));
        return;
      }
    }
    const payloadItems: ExpenseItemInput[] = items.map((item) => ({
      // Keeping the existing item id preserves the receipts attached to that item.
      id: item.id,
      categoryId: item.categoryId,
      expenseDate: item.expenseDate,
      amount: Number(item.amount),
      description: item.description,
    }));
    setSaving(true);
    try {
      const input = { purpose, items: payloadItems };
      if (reportId) {
        await updateExpenseReport(api, reportId, input);
      } else {
        await createExpenseReport(api, input);
      }
      // The list (and, when editing, the detail) that opened this form stays
      // mounted underneath it, so make every mounted reader refetch.
      invalidateExpenseData();
      await close();
    } catch (caught) {
      setError(expenseErrorMessage(caught, t('expenses.form.saveFailed'), t));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Loading className='py-10' />;
  }

  const categoryOptions =
    meta?.categories.map((category) => ({
      value: category.id,
      label: category.name,
    })) ?? [];

  return (
    <form
      className='space-y-4'
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      {error ? <Notice tone='error'>{error}</Notice> : null}

      <div className='space-y-2'>
        <Label htmlFor='expense-purpose'>{t('expenses.form.purpose')}</Label>
        <Textarea
          id='expense-purpose'
          onChange={(event) => setPurpose(event.target.value)}
          placeholder={t('expenses.form.purposePlaceholder')}
          rows={2}
          value={purpose}
        />
      </div>

      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <Label>{t('expenses.form.items')}</Label>
          <Button
            onClick={() => setItems((current) => [...current, emptyItem()])}
            size='sm'
            type='button'
            variant='outline'
          >
            <Plus data-icon='inline-start' />
            {t('expenses.form.addItem')}
          </Button>
        </div>

        <div className='space-y-3'>
          {items.map((item, index) => (
            <div
              className='space-y-2 rounded-lg border border-border p-3'
              key={item.id}
            >
              <div className='grid gap-2 sm:grid-cols-2'>
                <div className='space-y-1'>
                  <Label>{t('expenses.form.category')}</Label>
                  <Select
                    items={categoryOptions}
                    onValueChange={(value) =>
                      updateItem(index, {
                        categoryId: typeof value === 'string' ? value : '',
                      })
                    }
                    value={item.categoryId || null}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue
                        placeholder={t('expenses.form.categoryPlaceholder')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-1'>
                  <Label>{t('expenses.form.date')}</Label>
                  <Input
                    onChange={(event) =>
                      updateItem(index, { expenseDate: event.target.value })
                    }
                    type='date'
                    value={item.expenseDate}
                  />
                </div>
                <div className='space-y-1'>
                  <Label>{t('expenses.form.amount')}</Label>
                  <Input
                    min='0.01'
                    onChange={(event) =>
                      updateItem(index, { amount: event.target.value })
                    }
                    placeholder='0.00'
                    step='0.01'
                    type='number'
                    value={item.amount}
                  />
                </div>
                <div className='space-y-1'>
                  <Label>{t('expenses.form.description')}</Label>
                  <Input
                    onChange={(event) =>
                      updateItem(index, { description: event.target.value })
                    }
                    placeholder={t('expenses.form.descriptionPlaceholder')}
                    value={item.description}
                  />
                </div>
              </div>
              {items.length > 1 ? (
                <Button
                  onClick={() =>
                    setItems((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
                  size='sm'
                  type='button'
                  variant='ghost'
                >
                  <Trash2 data-icon='inline-start' />
                  {t('expenses.form.removeItem')}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className='flex items-center justify-between border-t border-border pt-4'>
        <p className='text-sm'>
          <span className='text-muted-foreground'>
            {t('expenses.form.total')}:
          </span>{' '}
          <span className='font-medium'>{formatAmount(total)}</span>
        </p>
        <div className='flex items-center gap-2'>
          <Button
            disabled={isClosing || saving}
            onClick={() => {
              void close().catch(() => undefined);
            }}
            type='button'
            variant='outline'
          >
            {t('actions.cancel')}
          </Button>
          <Button disabled={saving} type='submit'>
            {saving ? t('expenses.form.saving') : t('actions.save')}
          </Button>
        </div>
      </div>
    </form>
  );
}
