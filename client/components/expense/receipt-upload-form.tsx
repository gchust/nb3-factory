import { useService } from '@nocobase/app-client';
import {
  clientFileRepositoryManagerToken,
  type FileRecord,
} from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, useState, type ReactElement } from 'react';

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
import { FileUploadField } from '@/extensions/nocobase-file-component-ui';
import {
  RECEIPT_TYPES,
  useExpenseApi,
  type ReceiptType,
} from '@/lib/expense-api';
import {
  RECEIPT_TYPE_KEYS,
  messageOf,
  todayInputValue,
} from '@/lib/expense-display';

/** Mirrors the server's limit; the server refuses an oversized upload regardless of what this checks. */
const RECEIPT_FILE_MAX_SIZE = 5 * 1024 * 1024;
const RECEIPT_FILE_ACCEPT = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.pdf',
] as const;

export interface ReceiptUploadFormProps {
  readonly claimId: number;
  readonly onAdded: () => void;
}

export function ReceiptUploadForm({
  claimId,
  onAdded,
}: ReceiptUploadFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useExpenseApi();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository('expenseReceiptFiles'),
    [manager],
  );
  const [files, setFiles] = useState<readonly FileRecord[]>([]);
  const [amount, setAmount] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => todayInputValue());
  const [receiptType, setReceiptType] = useState<ReceiptType>('vat-invoice');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const typeItems = Object.fromEntries(
    RECEIPT_TYPES.map((value) => [value, t(RECEIPT_TYPE_KEYS[value])]),
  );

  const submit = async (): Promise<void> => {
    const file = files[0];
    if (!file) {
      setError(t('expense.receipts.fileRequired'));
      return;
    }
    const parsed = Number.parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(t('expense.receipts.amountInvalid'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.addReceipt(claimId, {
        fileId: file.id,
        amount: parsed,
        invoiceDate,
        receiptType,
      });
      setFiles([]);
      setAmount('');
      setInvoiceDate(todayInputValue());
      onAdded();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='space-y-4'>
      <FileUploadField
        repository={repository}
        value={files}
        onChange={setFiles}
        onError={(cause) => setError(cause.message)}
        onStatusChange={(status) => setUploading(status === 'uploading')}
        accept={RECEIPT_FILE_ACCEPT}
        maxSize={RECEIPT_FILE_MAX_SIZE}
        maxFiles={1}
        labels={{
          choose: t('expense.receipts.chooseFile'),
          preview: t('expense.receipts.preview'),
          download: t('expense.receipts.download'),
          remove: t('expense.receipts.remove'),
          retry: t('expense.receipts.retry'),
          typeRejected: t('expense.receipts.typeRejected'),
          sizeRejected: t('expense.receipts.sizeRejected'),
          tooManyFiles: t('expense.receipts.tooManyFiles'),
        }}
      />
      <p className='text-xs text-muted-foreground'>
        {t('expense.receipts.acceptedHint')}
      </p>
      <div className='grid gap-3 sm:grid-cols-3'>
        <div className='space-y-1.5'>
          <Label htmlFor='receipt-amount'>{t('expense.fields.amount')}</Label>
          <Input
            id='receipt-amount'
            inputMode='decimal'
            value={amount}
            placeholder='0.00'
            onChange={(event) => setAmount(event.currentTarget.value)}
          />
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='receipt-date'>
            {t('expense.fields.invoiceDate')}
          </Label>
          <Input
            id='receipt-date'
            type='date'
            value={invoiceDate}
            onChange={(event) => setInvoiceDate(event.currentTarget.value)}
          />
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='receipt-type'>
            {t('expense.fields.receiptType')}
          </Label>
          <Select
            items={typeItems}
            value={receiptType}
            onValueChange={(value: string | null) =>
              setReceiptType((value ?? 'vat-invoice') as ReceiptType)
            }
          >
            <SelectTrigger id='receipt-type' className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECEIPT_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(RECEIPT_TYPE_KEYS[value])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
      <Button
        type='button'
        disabled={saving || uploading || files.length === 0}
        onClick={() => void submit()}
      >
        {saving ? t('expense.receipts.adding') : t('expense.receipts.add')}
      </Button>
    </div>
  );
}
