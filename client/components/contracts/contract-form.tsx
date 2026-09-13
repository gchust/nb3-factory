import { FileText, Upload, X } from 'lucide-react';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement, type ReactNode } from 'react';

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
import {
  ATTACHMENT_ACCEPT,
  attachmentViolation,
  CONTRACT_CATEGORIES,
  contractErrorMessage,
  downloadUrl,
  useContractsApi,
  type ContractAttachment,
  type ContractCategory,
  type ContractRecord,
} from '@/lib/contracts';

export interface ContractFormProps {
  /** The contract being edited; null for a new one. */
  readonly initial?: ContractRecord | null;
  /** Called after a successful save; the page reloads and closes the form. */
  readonly onSaved: () => void;
  readonly onCancel: () => void;
}

export function ContractForm({
  initial = null,
  onSaved,
  onCancel,
}: ContractFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useContractsApi();

  const [name, setName] = useState(initial?.name ?? '');
  const [counterparty, setCounterparty] = useState(initial?.counterparty ?? '');
  const [category, setCategory] = useState<ContractCategory>(
    initial?.category ?? 'procurement',
  );
  const [attachment, setAttachment] = useState<ContractAttachment | null>(
    initial?.attachment ?? null,
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = uploading || saving;

  const handleFile = async (file: File): Promise<void> => {
    const violation = attachmentViolation(file);
    if (violation) {
      setError(t(`contracts.errors.${violation}`));
      return;
    }
    setUploading(true);
    setError(null);
    try {
      setAttachment(await api.uploadAttachment(file));
    } catch (cause) {
      setError(contractErrorMessage(cause, t));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    if (!name.trim()) {
      setError(t('contracts.errors.CONTRACT_NAME_REQUIRED'));
      return;
    }
    if (!counterparty.trim()) {
      setError(t('contracts.errors.CONTRACT_COUNTERPARTY_REQUIRED'));
      return;
    }
    if (!attachment) {
      setError(t('contracts.errors.CONTRACT_ATTACHMENT_REQUIRED'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const values = {
        name: name.trim(),
        counterparty: counterparty.trim(),
        category,
        attachmentId: attachment.id,
      };
      if (initial) await api.update(initial.id, values);
      else await api.create(values);
      onSaved();
    } catch (cause) {
      setError(contractErrorMessage(cause, t));
      setSaving(false);
    }
  };

  return (
    <form
      className='space-y-5'
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
    >
      <h2 className='font-heading text-lg font-semibold'>
        {initial ? t('contracts.editTitle') : t('contracts.newTitle')}
      </h2>

      {error ? (
        <div
          role='alert'
          className='rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
        >
          {error}
        </div>
      ) : null}

      <div className='grid gap-4 sm:grid-cols-2'>
        <Field label={t('contracts.fields.name')} required>
          <Input
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            disabled={disabled}
          />
        </Field>
        <Field label={t('contracts.fields.counterparty')} required>
          <Input
            value={counterparty}
            onChange={(event) => setCounterparty(event.currentTarget.value)}
            disabled={disabled}
          />
        </Field>
      </div>

      <Field label={t('contracts.fields.category')} required>
        <Select
          value={category}
          onValueChange={(value) => {
            if (value) setCategory(value);
          }}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('contracts.fields.category')} />
          </SelectTrigger>
          <SelectContent>
            {CONTRACT_CATEGORIES.map((item) => (
              <SelectItem key={item} value={item}>
                {t(`contracts.categories.${item}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label={t('contracts.fields.attachment')} required>
        {attachment ? (
          <div className='flex flex-wrap items-center gap-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2'>
            <FileText aria-hidden='true' className='size-4 shrink-0' />
            <span className='min-w-0 flex-1 truncate font-mono text-sm'>
              {attachment.filename}
            </span>
            <span className='text-xs text-muted-foreground'>
              {formatSize(attachment.size)}
            </span>
            <a
              className='text-sm text-primary underline-offset-4 hover:underline'
              href={attachment.contentUrl}
              target='_blank'
              rel='noreferrer'
            >
              {t('contracts.attachment.view')}
            </a>
            <a
              className='text-sm text-primary underline-offset-4 hover:underline'
              href={downloadUrl(attachment.contentUrl)}
              download={attachment.filename}
            >
              {t('contracts.attachment.download')}
            </a>
            <Button
              type='button'
              size='icon-xs'
              variant='ghost'
              aria-label={t('contracts.attachment.remove')}
              title={t('contracts.attachment.remove')}
              onClick={() => setAttachment(null)}
              disabled={disabled}
            >
              <X aria-hidden='true' />
            </Button>
          </div>
        ) : (
          <div className='space-y-1.5'>
            <Input
              type='file'
              accept={ATTACHMENT_ACCEPT}
              disabled={disabled}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void handleFile(file);
              }}
            />
            <p className='text-xs text-muted-foreground'>
              {uploading
                ? t('contracts.attachment.uploading')
                : t('contracts.attachment.hint')}
            </p>
          </div>
        )}
      </Field>

      <div className='flex items-center gap-2'>
        <Button type='submit' disabled={disabled}>
          <Upload aria-hidden='true' className='size-4' />
          {saving ? t('contracts.saving') : t('actions.save')}
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
    </form>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  readonly label: string;
  readonly required?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='space-y-1.5'>
      <Label>
        {label}
        {required ? <span className='text-destructive'> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
