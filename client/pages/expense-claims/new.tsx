import { apiClientToken, useService } from '@nocobase/app-client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import { FileUpIcon, PlusIcon, XIcon } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { errorMessage, formatMoney } from '@/pages/expense-claims/shared';

interface ItemRow {
  readonly key: string;
  readonly itemName: string;
  readonly amount: string;
  readonly note: string;
}

interface UploadedFile {
  readonly id: string;
  readonly name: string;
  readonly size: number;
}

let itemKeyCounter = 0;
function createItemKey(): string {
  itemKeyCounter += 1;
  return `item-${itemKeyCounter}`;
}

/**
 * Mirrors the server-side `isDateOnly` check: an ISO `YYYY-MM-DD` string that
 * names a real calendar day. Kept deliberately in lock-step with
 * `server/providers/expense-claims.ts` so the form never rejects what the API
 * would accept (or vice versa) for the expense date.
 */
function isValidExpenseDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

const EXPENSE_TYPES = [
  'travel',
  'office',
  'entertainment',
  'transport',
  'other',
] as const;

export default function NewExpenseClaimPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const fileManager = useService(clientFileRepositoryManagerToken);
  const navigate = useNavigate();

  const [expenseType, setExpenseType] = useState<string>('travel');
  const [expenseDate, setExpenseDate] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [items, setItems] = useState<readonly ItemRow[]>(() => [
    { key: createItemKey(), itemName: '', amount: '', note: '' },
  ]);
  const [uploads, setUploads] = useState<readonly UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const itemsSum = items.reduce(
    (sum: number, item) => sum + (parseFloat(item.amount) || 0),
    0,
  );
  const itemsSumCents = Math.round(itemsSum * 100);
  const totalCents =
    parseFloat(totalAmount) && totalAmount.trim() !== ''
      ? Math.round(parseFloat(totalAmount) * 100)
      : NaN;

  function updateItem(key: string, patch: Partial<Omit<ItemRow, 'key'>>) {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { key: createItemKey(), itemName: '', amount: '', note: '' },
    ]);
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }

  async function handleFileChange() {
    const input = fileInputRef.current;
    if (!input || !input.files?.length) return;
    const selection = Array.from(input.files);
    setUploading(true);
    setError(null);
    try {
      const result = await fileManager
        .repository('expenseClaimFiles')
        .uploadMany({ files: selection });
      setUploads((prev) => [
        ...prev,
        ...result.records.map((record) => ({
          id: record.id,
          name: record.filename,
          size: record.size,
        })),
      ]);
    } catch (cause) {
      setError(errorMessage(cause, t('expenseClaims.uploadFailed')));
    } finally {
      setUploading(false);
      input.value = '';
    }
  }

  function removeUpload(id: string) {
    setUploads((prev) => prev.filter((file) => file.id !== id));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!expenseDate) {
      setError(t('expenseClaims.fieldRequired'));
      return;
    }
    if (!isValidExpenseDate(expenseDate)) {
      setError(t('expenseClaims.dateFormatInvalid'));
      return;
    }
    const cleanedItems = items.filter((item) => item.itemName.trim() !== '');
    if (cleanedItems.length === 0) {
      setError(t('expenseClaims.fieldRequired'));
      return;
    }
    if (!Number.isFinite(itemsSumCents) || itemsSumCents <= 0) {
      setError(t('expenseClaims.mustBeNumber'));
      return;
    }
    if (!Number.isFinite(totalCents)) {
      setError(t('expenseClaims.mustBeNumber'));
      return;
    }
    if (itemsSumCents !== totalCents) {
      setError(t('expenseClaims.amountMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.request<{
        data: { id: string; claimNumber: string };
      }>({
        path: '/expense-claims',
        method: 'POST',
        json: {
          expenseType,
          expenseDate,
          totalAmount: itemsSum,
          description: description.trim() ? description.trim() : null,
          items: cleanedItems.map((item) => ({
            itemName: item.itemName.trim(),
            amount: parseFloat(item.amount),
            note: item.note.trim() ? item.note.trim() : null,
          })),
          attachments: uploads.map((file) => ({ fileId: file.id })),
        },
      });
      setSuccess(t('expenseClaims.saveSuccess'));
      void navigate(`/expense-claims/${data.id}`);
    } catch (cause) {
      setError(errorMessage(cause, t('expenseClaims.createFailed')));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className='mx-auto w-full max-w-3xl space-y-6 px-6 py-10'>
      <header className='space-y-1'>
        <Link
          to='/expense-claims'
          className='text-sm text-muted-foreground hover:text-foreground'
        >
          ← {t('expenseClaims.backToClaims')}
        </Link>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('expenseClaims.create')}
        </h1>
      </header>

      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className='space-y-6'
      >
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='expense-type'>
              {t('expenseClaims.expenseType')}
            </Label>
            <Select
              value={expenseType}
              onValueChange={(value) => {
                if (value !== null) setExpenseType(value);
              }}
            >
              <SelectTrigger id='expense-type' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`expenseClaims.types.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='expense-date'>
              {t('expenseClaims.expenseDate')}
            </Label>
            <Input
              id='expense-date'
              type='text'
              inputMode='numeric'
              autoComplete='off'
              maxLength={10}
              placeholder='YYYY-MM-DD'
              value={expenseDate}
              onChange={(event) => setExpenseDate(event.target.value)}
            />
            <p className='text-xs text-muted-foreground'>
              {t('expenseClaims.dateHint')}
            </p>
          </div>
        </div>

        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <Label className='text-base'>{t('expenseClaims.items')}</Label>
            <Button type='button' variant='outline' size='sm' onClick={addItem}>
              <PlusIcon className='size-4' aria-hidden='true' />
              {t('expenseClaims.addItem')}
            </Button>
          </div>
          <div className='space-y-3'>
            {items.map((item) => (
              <div
                key={item.key}
                className='grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_8rem_1fr_auto]'
              >
                <div className='space-y-2'>
                  <Label
                    className='text-xs text-muted-foreground'
                    htmlFor={`item-name-${item.key}`}
                  >
                    {t('expenseClaims.itemName')}
                  </Label>
                  <Input
                    id={`item-name-${item.key}`}
                    value={item.itemName}
                    placeholder='如：高铁票'
                    onChange={(event) =>
                      updateItem(item.key, { itemName: event.target.value })
                    }
                  />
                </div>
                <div className='space-y-2'>
                  <Label
                    className='text-xs text-muted-foreground'
                    htmlFor={`item-amount-${item.key}`}
                  >
                    {t('expenseClaims.amount')}
                  </Label>
                  <Input
                    id={`item-amount-${item.key}`}
                    type='number'
                    step='0.01'
                    min='0'
                    inputMode='decimal'
                    value={item.amount}
                    onChange={(event) =>
                      updateItem(item.key, { amount: event.target.value })
                    }
                  />
                </div>
                <div className='space-y-2'>
                  <Label
                    className='text-xs text-muted-foreground'
                    htmlFor={`item-note-${item.key}`}
                  >
                    {t('expenseClaims.note')}
                  </Label>
                  <Input
                    id={`item-note-${item.key}`}
                    value={item.note}
                    onChange={(event) =>
                      updateItem(item.key, { note: event.target.value })
                    }
                  />
                </div>
                <div className='flex items-end'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    aria-label={t('expenseClaims.removeItem')}
                    disabled={items.length === 1}
                    onClick={() => removeItem(item.key)}
                  >
                    <XIcon className='size-4' aria-hidden='true' />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='total-amount'>
              {t('expenseClaims.totalAmount')}
            </Label>
            <Input
              id='total-amount'
              type='number'
              step='0.01'
              min='0'
              inputMode='decimal'
              value={totalAmount}
              onChange={(event) => setTotalAmount(event.target.value)}
            />
            <p className='text-xs text-muted-foreground'>
              {t('expenseClaims.sumOfItems')}: {formatMoney(itemsSum)}
            </p>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='description'>
              {t('expenseClaims.description')}
            </Label>
            <Input
              id='description'
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>

        <div className='space-y-3'>
          <Label>{t('expenseClaims.attachments')}</Label>
          <div className='rounded-lg border border-dashed border-border p-4'>
            <input
              ref={fileInputRef}
              type='file'
              multiple
              className='hidden'
              onChange={() => {
                void handleFileChange();
              }}
            />
            <Button
              type='button'
              variant='outline'
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUpIcon className='size-4' aria-hidden='true' />
              {t('expenseClaims.chooseFiles')}
            </Button>
            <p className='mt-2 text-xs text-muted-foreground'>
              {t('expenseClaims.uploadHint')}
            </p>
            {uploads.length > 0 && (
              <ul className='mt-3 space-y-2'>
                {uploads.map((file) => (
                  <li
                    key={file.id}
                    className='flex items-center justify-between gap-2 text-sm'
                  >
                    <span className='truncate'>{file.name}</span>
                    <span className='shrink-0 text-xs text-muted-foreground'>
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      aria-label={t('expenseClaims.removeAttachment')}
                      onClick={() => removeUpload(file.id)}
                    >
                      <XIcon className='size-4' aria-hidden='true' />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {error && <p className='text-sm text-destructive'>{error}</p>}
        {success && <p className='text-sm text-emerald-600'>{success}</p>}

        <div className='flex gap-3'>
          <Button type='submit' disabled={submitting || uploading}>
            {submitting ? '…' : t('actions.save')}
          </Button>
          <Button
            variant='outline'
            type='button'
            onClick={() => void navigate('/expense-claims')}
          >
            {t('actions.cancel')}
          </Button>
        </div>
      </form>
    </section>
  );
}
