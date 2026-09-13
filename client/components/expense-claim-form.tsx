import { useMemo, useRef, useState, type ReactElement } from 'react';
import { PaperclipIcon, XIcon } from 'lucide-react';
import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  clientFileRepositoryManagerToken,
  type FileRecord,
} from '@nocobase/app-plugin-file/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loading } from '@/components/loading';
import { createExpenseClaim } from '@/lib/expense-claims';

const FILE_RESOURCE = 'expenseClaimFiles';
const ACCEPTED_TYPES = 'image/*,application/pdf';

export interface ExpenseClaimFormProps {
  readonly onCreated: (id: number) => void;
  readonly onCancel: () => void;
}

/** The "new expense claim" form, including multi-file receipt upload. */
export function ExpenseClaimForm({
  onCreated,
  onCancel,
}: ExpenseClaimFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository(FILE_RESOURCE),
    [manager],
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [attachments, setAttachments] = useState<readonly FileRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleFiles(selected: readonly File[]): Promise<void> {
    if (!selected.length) return;
    setError('');
    setUploading(true);
    try {
      const result = await repository.uploadMany({ files: selected });
      setAttachments((current) => [...current, ...result.records]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('expenseClaims.uploadFailed'),
      );
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(id: string): void {
    setAttachments((current) => current.filter((file) => file.id !== id));
  }

  async function submit(): Promise<void> {
    setError('');
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError(t('expenseClaims.reasonRequired'));
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError(t('expenseClaims.amountInvalid'));
      return;
    }
    if (!expenseDate) {
      setError(t('expenseClaims.dateRequired'));
      return;
    }
    if (!attachments.length) {
      setError(t('expenseClaims.attachmentsRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const claim = await createExpenseClaim(api, {
        reason: trimmedReason,
        amount: numericAmount,
        expenseDate,
        attachmentIds: attachments.map((file) => file.id),
      });
      onCreated(claim.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('expenseClaims.submitFailed'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const busy = uploading || submitting;

  return (
    <form
      className='space-y-6 rounded-lg border border-border bg-card p-6'
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className='grid gap-4 md:grid-cols-3'>
        <div className='grid gap-2 md:col-span-2'>
          <Label htmlFor='expense-reason'>
            {t('expenseClaims.form.reason')}
          </Label>
          <Input
            id='expense-reason'
            maxLength={255}
            placeholder={t('expenseClaims.form.reasonPlaceholder')}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <div className='grid gap-2'>
          <Label htmlFor='expense-amount'>
            {t('expenseClaims.form.amount')}
          </Label>
          <Input
            id='expense-amount'
            inputMode='decimal'
            min='0.01'
            placeholder={t('expenseClaims.form.amountPlaceholder')}
            step='0.01'
            type='number'
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className='grid gap-2'>
          <Label htmlFor='expense-date'>{t('expenseClaims.form.date')}</Label>
          <Input
            id='expense-date'
            type='date'
            value={expenseDate}
            onChange={(event) => setExpenseDate(event.target.value)}
          />
        </div>
      </div>

      <div className='space-y-3'>
        <Label htmlFor='expense-attachments'>
          {t('expenseClaims.form.attachments')}
        </Label>
        <input
          accept={ACCEPTED_TYPES}
          className='block w-full cursor-pointer rounded-lg border border-dashed border-border bg-background px-3 py-2 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground'
          id='expense-attachments'
          multiple
          ref={inputRef}
          type='file'
          disabled={busy}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            void handleFiles(files);
          }}
        />
        <p className='text-sm text-muted-foreground'>
          {t('expenseClaims.form.attachmentsHint')}
        </p>

        {uploading ? (
          <Loading
            className='justify-start py-1'
            label={t('expenseClaims.uploading')}
          />
        ) : null}

        {attachments.length ? (
          <ul className='divide-y divide-border rounded-lg border border-border'>
            {attachments.map((file) => (
              <li
                className='flex items-center justify-between gap-3 px-3 py-2 text-sm'
                key={file.id}
              >
                <span className='flex min-w-0 items-center gap-2'>
                  <PaperclipIcon
                    aria-hidden='true'
                    className='size-4 shrink-0 text-muted-foreground'
                  />
                  <span className='truncate'>{file.filename}</span>
                </span>
                <Button
                  aria-label={t('expenseClaims.form.removeAttachment', {
                    name: file.filename,
                  })}
                  disabled={busy}
                  size='icon-sm'
                  type='button'
                  variant='ghost'
                  onClick={() => removeAttachment(file.id)}
                >
                  <XIcon aria-hidden='true' />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? (
        <p className='text-sm text-destructive' role='alert'>
          {error}
        </p>
      ) : null}

      <div className='flex justify-end gap-2'>
        <Button
          disabled={busy}
          type='button'
          variant='outline'
          onClick={onCancel}
        >
          {t('actions.cancel')}
        </Button>
        <Button disabled={busy} type='submit'>
          {submitting ? t('expenseClaims.saving') : t('actions.save')}
        </Button>
      </div>
    </form>
  );
}
