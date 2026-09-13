import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { AttachmentUpload } from '@/components/expense/attachment-upload.js';
import { CategoryOptions } from '@/components/expense/claim-widgets.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
  createExpenseApi,
  formatMoney,
  yuanToCents,
  type AttachmentRecord,
  type ClaimInput,
  type ClaimRecord,
  type DepartmentRecord,
  type LoanRecord,
} from '@/lib/expense-api';

interface ItemRow {
  key: string;
  category: string;
  amount: string;
  remark: string;
}

export function ClaimForm({
  mode,
  claim,
  onSaved,
  onCancel,
}: {
  mode: 'create' | 'edit';
  claim?: ClaimRecord;
  onSaved: (claim: ClaimRecord) => void;
  onCancel: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const client = useService(apiClientToken);
  const api = useMemo(() => createExpenseApi(client), [client]);
  const [departments, setDepartments] = useState<readonly DepartmentRecord[]>(
    [],
  );
  const [loans, setLoans] = useState<readonly LoanRecord[]>([]);
  const [reason, setReason] = useState(claim?.reason ?? '');
  const [expenseDate, setExpenseDate] = useState(
    () => claim?.expenseDate ?? new Date().toISOString().slice(0, 10),
  );
  const [departmentId, setDepartmentId] = useState(
    claim?.departmentId === null || claim?.departmentId === undefined
      ? ''
      : String(claim.departmentId),
  );
  const [loanId, setLoanId] = useState(
    claim?.loanId === null || claim?.loanId === undefined
      ? ''
      : String(claim.loanId),
  );
  const [files, setFiles] = useState<readonly AttachmentRecord[]>(
    claim?.attachments ?? [],
  );
  const [items, setItems] = useState<readonly ItemRow[]>(() =>
    claim && claim.items.length > 0
      ? claim.items.map((item) => ({
          key: crypto.randomUUID(),
          category: item.category,
          amount: formatMoney(item.amountCents),
          remark: item.remark ?? '',
        }))
      : [
          {
            key: crypto.randomUUID(),
            category: 'travel',
            amount: '',
            remark: '',
          },
        ],
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [departmentList, loanList] = await Promise.all([
        api.departments(),
        api.loans(),
      ]);
      if (!active) return;
      setDepartments(departmentList);
      const currentLoanId = claim?.loanId ?? null;
      setLoans(
        loanList.filter((loan) => !loan.settled || loan.id === currentLoanId),
      );
    })();
    return () => {
      active = false;
    };
  }, [api, claim?.loanId]);

  const totalCents = items.reduce(
    (sum, item) => sum + (yuanToCents(item.amount) ?? 0),
    0,
  );

  function updateItem(key: string, patch: Partial<ItemRow>): void {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function removeItem(key: string): void {
    setItems((current) => current.filter((item) => item.key !== key));
  }

  async function save(): Promise<void> {
    setError('');
    if (!reason.trim()) {
      setError(t('expense.form.reasonRequired'));
      return;
    }
    if (items.length === 0) {
      setError(t('expense.form.itemsRequired'));
      return;
    }
    const normalized = [];
    for (const item of items) {
      const amountCents = yuanToCents(item.amount);
      if (amountCents === null) {
        setError(t('expense.form.amountInvalid'));
        return;
      }
      normalized.push({
        category: item.category as ClaimInput['items'][number]['category'],
        amountCents,
        remark: item.remark.trim() || null,
      });
    }
    const input: ClaimInput = {
      reason: reason.trim(),
      departmentId: departmentId ? Number(departmentId) : null,
      expenseDate,
      loanId: loanId ? Number(loanId) : null,
      fileIds: files.map((file) => file.id),
      items: normalized,
    };
    setSaving(true);
    try {
      const saved =
        mode === 'edit' && claim
          ? await api.updateClaim(claim.id, input)
          : await api.createClaim(input);
      onSaved(saved);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t('expense.form.saveFailed'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className='space-y-4'>
      {claim && claim.status !== 'pending' && claim.status !== 'rejected' && (
        <p
          role='alert'
          className='rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
        >
          {t('expense.form.lockedNotice')}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t('expense.form.basic')}</CardTitle>
        </CardHeader>
        <CardContent className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='expense-department'>
              {t('expense.field.department')}
            </Label>
            <select
              id='expense-department'
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className='h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
            >
              <option value=''>{t('expense.unassignedDepartment')}</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='expense-date'>
              {t('expense.field.expenseDate')}
            </Label>
            <Input
              id='expense-date'
              type='date'
              value={expenseDate}
              onChange={(event) => setExpenseDate(event.target.value)}
            />
          </div>
          <div className='space-y-2 sm:col-span-2'>
            <Label htmlFor='expense-reason'>{t('expense.field.reason')}</Label>
            <Textarea
              id='expense-reason'
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('expense.form.items')}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {items.map((item) => (
            <div
              key={item.key}
              className='grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]'
            >
              <select
                value={item.category}
                aria-label={t('expense.field.category')}
                onChange={(event) =>
                  updateItem(item.key, { category: event.target.value })
                }
                className='h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
              >
                <CategoryOptions />
              </select>
              <Input
                type='number'
                min='0'
                step='0.01'
                inputMode='decimal'
                placeholder={t('expense.field.amount')}
                aria-label={t('expense.field.amount')}
                value={item.amount}
                onChange={(event) =>
                  updateItem(item.key, { amount: event.target.value })
                }
              />
              <Input
                placeholder={t('expense.field.remark')}
                aria-label={t('expense.field.remark')}
                value={item.remark}
                onChange={(event) =>
                  updateItem(item.key, { remark: event.target.value })
                }
              />
              <Button
                type='button'
                variant='outline'
                onClick={() => removeItem(item.key)}
              >
                {t('expense.form.removeItem')}
              </Button>
            </div>
          ))}
          <div className='flex items-center justify-between'>
            <Button
              type='button'
              variant='outline'
              onClick={() =>
                setItems((current) => [
                  ...current,
                  {
                    key: crypto.randomUUID(),
                    category: 'travel',
                    amount: '',
                    remark: '',
                  },
                ])
              }
            >
              {t('expense.form.addItem')}
            </Button>
            <p className='text-sm font-medium'>
              {t('expense.form.total')}:{' '}
              <span className='font-mono'>{formatMoney(totalCents)}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('expense.form.loanAndAttachments')}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='expense-loan'>{t('expense.field.loan')}</Label>
            <select
              id='expense-loan'
              value={loanId}
              onChange={(event) => setLoanId(event.target.value)}
              className='h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
            >
              <option value=''>{t('expense.field.noLoan')}</option>
              {loans.map((loan) => (
                <option key={loan.id} value={loan.id}>
                  {loan.loanDate} · {formatMoney(loan.amountCents)} ·{' '}
                  {loan.purpose ?? ''}
                </option>
              ))}
            </select>
          </div>
          <div className='space-y-2'>
            <Label>{t('expense.field.attachments')}</Label>
            <AttachmentUpload
              files={files}
              onChange={setFiles}
              disabled={saving}
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <p
          role='alert'
          className='rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
        >
          {error}
        </p>
      )}

      <div className='flex gap-2'>
        <Button type='button' onClick={() => void save()} disabled={saving}>
          {saving && <Spinner />}
          {t('actions.save')}
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={onCancel}
          disabled={saving}
        >
          {t('actions.cancel')}
        </Button>
      </div>
    </div>
  );
}
