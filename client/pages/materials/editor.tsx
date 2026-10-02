import { useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, SaveIcon } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  FileUploadField,
  clientFileRepositoryManagerToken,
  type FileUploadStatus,
} from '@/extensions/nocobase-file-component-ui';
import {
  MATERIAL_FILE_REPOSITORY,
  materialErrorCode,
  materialErrorKey,
  type MaterialAttachment,
} from './api.js';

// The one editor shared by the create page and the detail page's edit mode.
//
// Uploaded records live in this component's own state rather than in the form
// body, so a save the server rejects — a missing title, most of all — leaves
// them in place. Filling the title in and saving again reuses the same
// attachment ids instead of asking for the upload a second time.

export interface MaterialEditorValues {
  readonly title: string;
  readonly fileIds: readonly string[];
}

export interface MaterialEditorProps {
  readonly initialTitle?: string;
  readonly initialFiles?: readonly MaterialAttachment[];
  readonly submitLabel: string;
  readonly busyLabel: string;
  readonly onCancel?: () => void;
  readonly onSubmit: (values: MaterialEditorValues) => Promise<void>;
}

const ACCEPTED_FILE_TYPES: readonly string[] = ['.png', '.docx'];

export function MaterialEditor(inputProps: MaterialEditorProps): ReactElement {
  const { t } = useTranslation();
  const fileManager = useService(clientFileRepositoryManagerToken);
  const repository = fileManager.repository(MATERIAL_FILE_REPOSITORY);

  const [title, setTitle] = useState(inputProps.initialTitle ?? '');
  const [files, setFiles] = useState<readonly MaterialAttachment[]>(
    inputProps.initialFiles ?? [],
  );
  const [titleError, setTitleError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [uploadStatus, setUploadStatus] = useState<FileUploadStatus>('idle');
  const [saving, setSaving] = useState(false);

  const busy = saving || uploadStatus === 'uploading';

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    setTitleError(undefined);
    setFormError(undefined);
    setSaving(true);
    void (async () => {
      try {
        await inputProps.onSubmit({
          title: title.trim(),
          fileIds: files.map((file) => file.id),
        });
      } catch (error) {
        const code = materialErrorCode(error);
        if (code === 'MATERIAL_TITLE_REQUIRED' || code === 'MATERIAL_TITLE_TOO_LONG') {
          setTitleError(t(materialErrorKey(code)));
        } else {
          setFormError(t(materialErrorKey(code)));
        }
      } finally {
        setSaving(false);
      }
    })();
  };

  return (
    <form noValidate onSubmit={handleSubmit} className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>{t('materials.form.title')}</CardTitle>
          <CardDescription>{t('materials.form.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {formError ? (
              <Alert variant='destructive'>
                <AlertCircleIcon aria-hidden='true' />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <Field data-invalid={titleError ? true : undefined}>
              <FieldLabel htmlFor='material-title'>
                {t('materials.form.titleLabel')}
              </FieldLabel>
              <Input
                id='material-title'
                value={title}
                maxLength={255}
                autoComplete='off'
                placeholder={t('materials.form.titlePlaceholder')}
                aria-invalid={titleError ? true : undefined}
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (titleError) setTitleError(undefined);
                }}
              />
              <FieldError>{titleError}</FieldError>
            </Field>

            <Field>
              <FieldLabel>{t('materials.form.filesLabel')}</FieldLabel>
              <FileUploadField
                repository={repository}
                value={files}
                multiple
                accept={ACCEPTED_FILE_TYPES}
                disabled={saving}
                onChange={setFiles}
                onStatusChange={setUploadStatus}
                onError={(error) =>
                  setFormError(t(materialErrorKey(materialErrorCode(error))))
                }
              />
              <FieldDescription>
                {uploadStatus === 'uploading'
                  ? t('materials.form.uploading')
                  : t('materials.form.filesHint')}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className='flex flex-wrap items-center gap-2'>
        <Button type='submit' disabled={busy}>
          {saving ? (
            <Spinner aria-hidden='true' />
          ) : (
            <SaveIcon data-icon='inline-start' />
          )}
          {saving ? inputProps.busyLabel : inputProps.submitLabel}
        </Button>
        {inputProps.onCancel ? (
          <Button
            type='button'
            variant='outline'
            disabled={saving}
            onClick={inputProps.onCancel}
          >
            {t('actions.cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
