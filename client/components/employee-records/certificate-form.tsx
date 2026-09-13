import { apiClientToken, useService } from '@nocobase/app-client';
import {
  clientFileRepositoryManagerToken,
  type ClientFileRepository,
} from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useMemo,
  useState,
} from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  createCertificate,
  EMPLOYEE_ATTACHMENT_RESOURCE,
  type Certificate,
} from './api.js';
import { employeeErrorMessage } from './error-message.js';

export interface CertificateFormProps {
  readonly employeeId: number;
  readonly onCreated: (certificate: Certificate) => void;
  readonly onCancel: () => void;
}

export function CertificateForm({
  employeeId,
  onCreated,
  onCancel,
}: CertificateFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const fileManager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => fileManager.repository(EMPLOYEE_ATTACHMENT_RESOURCE),
    [fileManager],
  );
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [files, setFiles] = useState<readonly File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(event.target.files ?? []));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const fileIds = await uploadAttachments(repository, files);
      const certificate = await createCertificate(api, employeeId, {
        name,
        expiresAt: expiresAt || null,
        fileIds,
      });
      onCreated(certificate);
    } catch (cause) {
      setError(employeeErrorMessage(t, cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className='space-y-4 rounded-lg border border-border bg-card p-4'
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='space-y-1.5'>
          <Label htmlFor='certificate-name'>
            {t('certificates.form.name')}
          </Label>
          <Input
            id='certificate-name'
            required
            maxLength={255}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='certificate-expires-at'>
            {t('certificates.form.expiresAt')}
          </Label>
          <Input
            id='certificate-expires-at'
            type='date'
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </div>
      </div>
      <div className='space-y-1.5'>
        <Label htmlFor='certificate-attachments'>
          {t('certificates.form.attachments')}
        </Label>
        <Input
          id='certificate-attachments'
          type='file'
          multiple
          onChange={handleFiles}
        />
        {files.length > 0 ? (
          <ul className='space-y-0.5 text-sm text-muted-foreground'>
            {files.map((file) => (
              <li key={`${file.name}-${file.size}`}>{file.name}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {error ? (
        <p className='text-sm text-destructive' role='alert'>
          {error}
        </p>
      ) : null}
      <div className='flex gap-2'>
        <Button disabled={submitting} type='submit'>
          {submitting ? t('certificates.form.saving') : t('actions.save')}
        </Button>
        <Button
          disabled={submitting}
          type='button'
          variant='outline'
          onClick={onCancel}
        >
          {t('actions.cancel')}
        </Button>
      </div>
    </form>
  );
}

async function uploadAttachments(
  repository: ClientFileRepository,
  files: readonly File[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const file of files) {
    const { record } = await repository.uploadOne({ file });
    ids.push(record.id);
  }
  return ids;
}
