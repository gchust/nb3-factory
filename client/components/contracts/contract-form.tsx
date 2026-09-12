import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement, type ReactNode } from 'react';

import { FileUploadField } from '@/extensions/nocobase-file-component-ui/components/file-upload-field';
import type { FileRecord } from '@/extensions/nocobase-file-component-ui/types';
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
import {
  CONTRACT_STATUSES,
  contractErrorMessage,
  useContractsApi,
  type ContractRecord,
  type ContractSaveInput,
  type ContractStatus,
} from '@/lib/contracts';
import {
  contractFileAccept,
  MAX_CONTRACT_FILE_SIZE,
} from '@/lib/contract-files';
import { fileUiLabels } from './file-labels.js';

export interface ContractFormProps {
  /** The contract being edited; null for a new one. */
  readonly initial?: ContractRecord | null;
  /** Persists the form; rejections are shown inline. */
  readonly onSave: (values: ContractSaveInput) => Promise<void>;
  /** Label of the primary button. */
  readonly submitLabel: string;
  /** Label of the cancel link. */
  readonly cancelLabel: string;
  readonly onCancel: () => void;
}

export function ContractForm({
  initial = null,
  onSave,
  submitLabel,
  cancelLabel,
  onCancel,
}: ContractFormProps): ReactElement {
  const { t } = useTranslation();
  const { bodyRepository, attachmentsRepository } = useContractsApi();

  const [contractNo, setContractNo] = useState(initial?.contractNo ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [party, setParty] = useState(initial?.party ?? '');
  const [signedAt, setSignedAt] = useState(initial?.signedAt ?? '');
  const [amount, setAmount] = useState(String(initial?.amount ?? ''));
  const [status, setStatus] = useState<ContractStatus>(
    initial?.status ?? 'draft',
  );
  const [remark, setRemark] = useState(initial?.remark ?? '');
  const [bodyFiles, setBodyFiles] = useState<readonly FileRecord[]>(
    initial?.body ? [initial.body] : [],
  );
  const [attachmentFiles, setAttachmentFiles] = useState<readonly FileRecord[]>(
    initial?.attachments ?? [],
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attachmentLabels = {
    ...fileUiLabels(t),
    choose: t('contracts.form.chooseAttachments'),
    typeNotAllowed: t('contracts.errors.ATTACHMENT_FILE_TYPE_NOT_ALLOWED'),
  };
  const bodyUploadLabels = {
    ...fileUiLabels(t),
    choose: t('contracts.form.chooseBody'),
    typeNotAllowed: t('contracts.errors.BODY_FILE_TYPE_NOT_ALLOWED'),
  };

  const handleBodyStatus = (state: 'idle' | 'uploading' | 'error') => {
    setUploading(state === 'uploading');
  };
  const handleAttachmentStatus = (state: 'idle' | 'uploading' | 'error') => {
    setUploading((current) => current || state === 'uploading');
  };

  const handleSave = async (): Promise<void> => {
    const values: ContractSaveInput = {
      contractNo: contractNo.trim(),
      name: name.trim(),
      party: party.trim(),
      signedAt: signedAt.trim() || null,
      amount: amount.trim() || null,
      status,
      remark: remark.trim() || null,
      bodyFileId: bodyFiles[0]?.id ?? null,
      attachmentFileIds: attachmentFiles.map((file) => file.id),
    };
    if (!values.contractNo) {
      setError(t('contracts.errors.CONTRACT_NO_REQUIRED'));
      return;
    }
    if (!values.name) {
      setError(t('contracts.errors.CONTRACT_NAME_REQUIRED'));
      return;
    }
    if (!values.party) {
      setError(t('contracts.errors.CONTRACT_PARTY_REQUIRED'));
      return;
    }
    if (values.signedAt && !/^\d{4}-\d{2}-\d{2}$/.test(values.signedAt)) {
      setError(t('contracts.errors.CONTRACT_SIGNED_AT_INVALID'));
      return;
    }
    if (values.amount && !/^\d+(\.\d{1,2})?$/.test(values.amount)) {
      setError(t('contracts.errors.CONTRACT_AMOUNT_INVALID'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(values);
    } catch (saveError) {
      setError(contractErrorMessage(saveError, t));
      setSaving(false);
    }
  };

  const disabled = uploading || saving;

  return (
    <form
      className='space-y-5'
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
    >
      {error ? (
        <div
          role='alert'
          className='rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
        >
          {error}
        </div>
      ) : null}

      <div className='grid gap-4 sm:grid-cols-2'>
        <Field label={t('contracts.fields.contractNo')} required>
          <Input
            value={contractNo}
            onChange={(event) => setContractNo(event.currentTarget.value)}
            disabled={disabled}
          />
        </Field>
        <Field label={t('contracts.fields.status')}>
          <Select
            value={status}
            onValueChange={(value) => {
              if (value) setStatus(value);
            }}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('contracts.fields.status')} />
            </SelectTrigger>
            <SelectContent>
              {CONTRACT_STATUSES.map((item) => (
                <SelectItem key={item} value={item}>
                  {t(`contracts.statuses.${item}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className='grid gap-4 sm:grid-cols-2'>
        <Field label={t('contracts.fields.name')} required>
          <Input
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            disabled={disabled}
          />
        </Field>
        <Field label={t('contracts.fields.party')} required>
          <Input
            value={party}
            onChange={(event) => setParty(event.currentTarget.value)}
            disabled={disabled}
          />
        </Field>
      </div>

      <div className='grid gap-4 sm:grid-cols-2'>
        <Field label={t('contracts.fields.signedAt')}>
          <Input
            type='date'
            value={signedAt}
            onChange={(event) => setSignedAt(event.currentTarget.value)}
            disabled={disabled}
          />
        </Field>
        <Field label={t('contracts.fields.amount')}>
          <Input
            inputMode='decimal'
            placeholder='0.00'
            value={amount}
            onChange={(event) => setAmount(event.currentTarget.value)}
            disabled={disabled}
          />
        </Field>
      </div>

      <Field label={t('contracts.fields.remark')}>
        <Textarea
          value={remark}
          onChange={(event) => setRemark(event.currentTarget.value)}
          disabled={disabled}
        />
      </Field>

      <Field
        label={t('contracts.fields.body')}
        hint={t('contracts.form.bodyHint')}
      >
        <FileUploadField
          repository={bodyRepository}
          value={bodyFiles}
          onChange={(next) => setBodyFiles([...(next ?? [])])}
          onStatusChange={handleBodyStatus}
          onError={(uploadError) => setError(uploadError.message)}
          multiple={false}
          accept={contractFileAccept('body')}
          maxSize={MAX_CONTRACT_FILE_SIZE}
          removeOnDelete={false}
          labels={bodyUploadLabels}
        />
      </Field>

      <Field
        label={t('contracts.fields.attachments')}
        hint={t('contracts.form.attachmentsHint')}
      >
        <FileUploadField
          repository={attachmentsRepository}
          value={attachmentFiles}
          onChange={(next) => setAttachmentFiles([...(next ?? [])])}
          onStatusChange={handleAttachmentStatus}
          onError={(uploadError) => setError(uploadError.message)}
          multiple
          accept={contractFileAccept('attachment')}
          maxSize={MAX_CONTRACT_FILE_SIZE}
          maxFiles={20}
          removeOnDelete={false}
          labels={attachmentLabels}
        />
      </Field>

      <div className='flex items-center gap-2'>
        <Button type='submit' disabled={disabled}>
          {submitLabel}
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={onCancel}
          disabled={saving}
        >
          {cancelLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required = false,
  hint,
  children,
}: {
  readonly label: string;
  readonly required?: boolean;
  readonly hint?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='space-y-1.5'>
      <Label>
        {label}
        {required ? <span className='text-destructive'> *</span> : null}
      </Label>
      {children}
      {hint ? <p className='text-xs text-muted-foreground'>{hint}</p> : null}
    </div>
  );
}
