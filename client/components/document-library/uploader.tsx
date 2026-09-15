import type { ApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ChangeEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { errorCode, uploadDocuments } from './api.js';
import { SelectInput } from './controls.js';
import { errorDescriptor, validateSelection } from './messages.js';
import {
  fileTypeLabel,
  formatBytes,
  type DocumentCapabilities,
  type DocumentRecord,
} from './types.js';

export interface DocumentUploaderProps {
  readonly api: ApiClient;
  readonly capabilities: DocumentCapabilities;
  readonly onUploaded: (records: readonly DocumentRecord[]) => void;
}

/**
 * Batch upload. The clerk picks a discipline and version once for the whole selection, chooses several local
 * files, and the whole selection is validated locally and again on the server before it is registered. A rejected
 * selection never reaches the server, so the ledger is unchanged.
 */
export function DocumentUploader({
  api,
  capabilities,
  onUploaded,
}: DocumentUploaderProps): ReactElement {
  const { t } = useTranslation();
  const [discipline, setDiscipline] = useState(
    capabilities.disciplines[0] ?? '',
  );
  const [version, setVersion] = useState('1.0');
  const [files, setFiles] = useState<readonly File[]>([]);
  const [inputKey, setInputKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [errorCodeValue, setErrorCodeValue] = useState<string>();
  const [successCount, setSuccessCount] = useState<number>();

  const accept = capabilities.extensions
    .map((extension) => `.${extension}`)
    .join(',');

  const handleFiles = (event: ChangeEvent<HTMLInputElement>): void => {
    setFiles(Array.from(event.currentTarget.files ?? []));
    setErrorCodeValue(undefined);
    setSuccessCount(undefined);
  };

  const submit = async (): Promise<void> => {
    setSuccessCount(undefined);
    const validation = validateSelection(files, capabilities);
    if (!validation.ok) {
      setErrorCodeValue(validation.code);
      return;
    }
    setUploading(true);
    setErrorCodeValue(undefined);
    try {
      const records = await uploadDocuments(api, {
        discipline,
        version,
        files,
      });
      setSuccessCount(records.length);
      setFiles([]);
      setInputKey((value) => value + 1);
      setVersion('1.0');
      onUploaded(records);
    } catch (error) {
      setErrorCodeValue(errorCode(error) ?? 'generic');
    } finally {
      setUploading(false);
    }
  };

  const descriptor = errorDescriptor(errorCodeValue, capabilities);

  return (
    <section
      data-slot='document-uploader'
      className='space-y-4 rounded-lg border border-border bg-card p-4'
      aria-label={t('documents.upload.title')}
    >
      <h2 className='text-base font-semibold'>{t('documents.upload.title')}</h2>
      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='space-y-1.5'>
          <Label htmlFor='document-upload-discipline'>
            {t('documents.upload.discipline')}
          </Label>
          <SelectInput
            id='document-upload-discipline'
            value={discipline}
            onChange={(event) => setDiscipline(event.currentTarget.value)}
          >
            {capabilities.disciplines.map((option) => (
              <option key={option} value={option}>
                {t(`documents.discipline.${option}`, { defaultValue: option })}
              </option>
            ))}
          </SelectInput>
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='document-upload-version'>
            {t('documents.upload.version')}
          </Label>
          <Input
            id='document-upload-version'
            value={version}
            maxLength={32}
            onChange={(event) => setVersion(event.currentTarget.value)}
          />
        </div>
      </div>

      <div className='space-y-1.5'>
        <Label htmlFor='document-upload-files'>
          {t('documents.upload.files')}
        </Label>
        <Input
          key={inputKey}
          id='document-upload-files'
          type='file'
          multiple
          accept={accept}
          onChange={handleFiles}
          aria-describedby='document-upload-hint'
        />
        <p id='document-upload-hint' className='text-xs text-muted-foreground'>
          {t('documents.upload.hint', {
            extensions: capabilities.extensions
              .map((extension) => extension.toUpperCase())
              .join(', '),
            maxFiles: capabilities.limits.maxFiles,
            maxFileSize: formatBytes(capabilities.limits.maxFileBytes),
            maxBatchSize: formatBytes(capabilities.limits.maxBatchBytes),
          })}
        </p>
      </div>

      {files.length > 0 ? (
        <ul
          className='space-y-1 text-sm'
          aria-label={t('documents.upload.selected')}
        >
          {files.map((file) => (
            <li
              key={`${file.name}:${file.size}:${file.lastModified}`}
              className='flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1'
            >
              <span className='truncate'>{file.name}</span>
              <span className='shrink-0 text-muted-foreground'>
                {fileTypeLabel({ ext: file.name.split('.').pop() ?? '' })} ·{' '}
                {formatBytes(file.size)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {errorCodeValue ? (
        <p role='alert' className='text-sm text-destructive'>
          {t(descriptor.key, descriptor.options)}
        </p>
      ) : null}
      {successCount !== undefined ? (
        <p
          role='status'
          className='text-sm text-emerald-600 dark:text-emerald-400'
        >
          {t('documents.upload.success', { count: successCount })}
        </p>
      ) : null}

      <Button type='button' onClick={() => void submit()} disabled={uploading}>
        {uploading
          ? t('documents.upload.uploading')
          : t('documents.upload.submit')}
      </Button>
    </section>
  );
}
