import { zodResolver } from '@hookform/resolvers/zod';
import {
  ApiClientError,
  useApiClient,
  useService,
  useToaster,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  clientFileRepositoryManagerToken,
  FileUploadField,
  type FileRecord,
  type FileUploadStatus,
} from '@/extensions/nocobase-file-component-ui';

import { createMaterial, updateMaterial } from './material-api.js';
import { SessionExpiredAlert } from './materials-state.js';
import type { Material } from './types.js';

/** The image and document types v1 accepts. */
const ACCEPTED_TYPES = [
  'image/png',
  '.png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.docx',
] as const;

export interface MaterialsFormProps {
  /** When editing, the record to start from; omit it when creating. */
  readonly material?: Material;
  /** The `<form>` id. When the submit button is outside the form, the button sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. The form has already shown the success message. */
  readonly onSubmitted: (material: Material) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` comes before `onSubmitted` is called. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** The attachment selection changed and uploads are starting, running or finished. */
  readonly onUploadStatusChange?: (status: FileUploadStatus) => void;
  /** When editing, the endpoint returned 404: the material has been deleted. */
  readonly onNotFound?: () => void;
}

/**
 * The one form behind both creating and editing a material. It handles fields,
 * validation and submission only: the container owns the title, the submit
 * button and opening/closing.
 *
 * Uploading and saving are two separate submissions (B03). Files upload as soon
 * as they are chosen and their records live in this component's state, so a
 * failed business save — a blank title, a dropped connection — leaves the
 * selection in place and saving again re-sends it without re-uploading.
 */
export function MaterialsForm({
  material,
  formId,
  onSubmitted,
  onSubmittingChange,
  onUploadStatusChange,
  onNotFound,
}: MaterialsFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const repositories = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => repositories.repository('projectMaterialFiles'),
    [repositories],
  );

  const [files, setFiles] = useState<readonly FileRecord[]>(
    material?.files ?? [],
  );
  const [uploadStatus, setUploadStatus] = useState<FileUploadStatus>('idle');

  useEffect(() => {
    onUploadStatusChange?.(uploadStatus);
  }, [uploadStatus, onUploadStatusChange]);

  // The schema lives in the component so its message follows the current language.
  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('materials.form.titleRequired'))
          .max(255, t('materials.form.titleTooLong', { max: 255 })),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { title: material?.title ?? '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    if (uploadStatus !== 'idle') {
      // The upload field keeps its own retry; submitting a half-uploaded
      // selection would save a material that is missing a file the user chose.
      form.setError('root', { message: t('materials.form.uploading') });
      return;
    }
    const input = { title: values.title, fileIds: files.map((f) => f.id) };
    let saved: Material;
    onSubmittingChange?.(true);
    try {
      saved = material
        ? await updateMaterial(api, material.id, input)
        : await createMaterial(api, input);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (
        apiError?.status === 400 &&
        apiError.reason === 'MATERIAL_TITLE_REQUIRED'
      ) {
        form.setError(
          'title',
          { message: t('materials.form.titleRequired') },
          { shouldFocus: true },
        );
      } else if (apiError?.status === 401) {
        form.setError('root', { type: 'sessionExpired' });
      } else if (material && apiError?.status === 404) {
        onNotFound?.();
      } else {
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('materials.error.forbidden')
              : t('materials.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: material
        ? t('materials.edit.success', { title: saved.title })
        : t('materials.create.success', { title: saved.title }),
    });
    onSubmitted(saved);
  });

  const rootError = form.formState.errors.root;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {rootError?.type === 'sessionExpired' ? (
          <SessionExpiredAlert />
        ) : rootError ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{rootError.message}</AlertDescription>
          </Alert>
        ) : null}
        <Controller
          control={form.control}
          name='title'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-title`}>
                {t('materials.form.title')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-title`}
                autoComplete='off'
                autoFocus
                aria-required='true'
                aria-invalid={fieldState.invalid}
                placeholder={t('materials.form.titlePlaceholder')}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Field>
          <FieldLabel>{t('materials.form.attachments')}</FieldLabel>
          <FileUploadField
            repository={repository}
            value={files}
            onChange={setFiles}
            onStatusChange={setUploadStatus}
            multiple
            accept={ACCEPTED_TYPES}
            maxFiles={50}
          />
          <FieldDescription>
            {uploadStatus === 'uploading'
              ? t('materials.form.uploading')
              : t('materials.form.attachmentsHint')}
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
