import { zodResolver } from '@hookform/resolvers/zod';
import {
  ApiClientError,
  useApiClient,
  useService,
  useToaster,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  FileList,
  FileUploadField,
  clientFileRepositoryManagerToken,
  type FileRecord,
  type FileUploadStatus,
} from '@/extensions/nocobase-file-component-ui';

import { createMaterial, updateMaterial } from './material-api.js';
import {
  MATERIAL_FILE_ACCEPT,
  MATERIAL_FILE_MAX_SIZE,
  toFileRecord,
  type Material,
} from './types.js';

export interface MaterialFormProps {
  /** When editing, the material just loaded; omit it when creating. */
  readonly material?: Material;
  /** The `<form>` id. A submit button outside the form names it through `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the material the endpoint returned. The form has already shown the toast. */
  readonly onSubmitted: (material: Material) => void;
  /** `true` while the save request is in flight and `false` once it ends. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** `true` while an upload is running or a file failed, which is when saving must wait. */
  readonly onBlockedChange?: (blocked: boolean) => void;
  /** The endpoint answered `404`: another user's material, or one that was deleted. */
  readonly onNotFound?: () => void;
}

interface FieldViolation {
  readonly field: string;
  readonly description?: string;
}

/** The field a validation failure names, when the server reports one. */
function firstViolation(payload: unknown): FieldViolation | undefined {
  const violations = (
    payload as {
      readonly error?: {
        readonly fieldViolations?: readonly FieldViolation[];
      };
    }
  )?.error?.fieldViolations;
  return violations?.[0];
}

/**
 * The title, the notes, and the attachments of a material.
 *
 * An attachment is uploaded as soon as it is chosen and named to the material only when the form is saved, so a save
 * that fails — a missing title, a lost connection — keeps the uploaded files and the user adds the title and saves
 * again without uploading anything a second time. Removing a saved attachment takes it out of this form's list and
 * out of the material on save; the file itself is never deleted.
 */
export function MaterialForm(inputProps: MaterialFormProps): ReactElement {
  const {
    material,
    formId,
    onSubmitted,
    onSubmittingChange,
    onBlockedChange,
    onNotFound,
  } = inputProps;
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const repository = useService(clientFileRepositoryManagerToken).repository(
    'projectMaterialFiles',
  );

  // The attachments the material already has. Removing one here detaches it on save; nothing touches the file.
  const [savedFiles, setSavedFiles] = useState<readonly FileRecord[]>(() =>
    (material?.files ?? []).map(toFileRecord),
  );
  // Attachments uploaded in this session but not yet linked to the material; they survive a failed save.
  const [pendingFiles, setPendingFiles] = useState<readonly FileRecord[]>([]);
  const [uploadStatus, setUploadStatus] = useState<FileUploadStatus>('idle');

  // The schema lives in the component so a validation message follows the current language.
  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('materials.form.titleRequired'))
          .max(200, t('materials.form.titleTooLong', { max: 200 })),
        description: z
          .string()
          .max(2000, t('materials.form.descriptionTooLong', { max: 2000 })),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: material?.title ?? '',
      description: material?.description ?? '',
    },
  });

  useEffect(() => {
    onBlockedChange?.(uploadStatus !== 'idle');
  }, [uploadStatus, onBlockedChange]);

  const fileLabels = useMemo(
    () => ({
      choose: t('materials.files.choose'),
      preview: t('materials.files.preview'),
      download: t('materials.files.download'),
      remove: t('materials.files.remove'),
      empty: t('materials.files.empty'),
    }),
    [t],
  );

  const onSubmit = form.handleSubmit(async (values) => {
    const draft = {
      title: values.title,
      description: values.description.trim() ? values.description : null,
      fileIds: [
        ...savedFiles.map((file) => file.id),
        ...pendingFiles.map((file) => file.id),
      ],
    };
    onSubmittingChange?.(true);
    try {
      const saved = material
        ? await updateMaterial(api, material.id, draft)
        : await createMaterial(api, draft);
      // The save linked the pending files and dropped the removed ones, so the form now matches the server again.
      setSavedFiles(saved.files.map(toFileRecord));
      setPendingFiles([]);
      form.reset({
        title: saved.title,
        description: saved.description ?? '',
      });
      toaster.show({
        type: 'success',
        title: material
          ? t('materials.form.saved')
          : t('materials.form.created'),
      });
      onSubmittingChange?.(false);
      onSubmitted(saved);
    } catch (error) {
      onSubmittingChange?.(false);
      if (error instanceof ApiClientError) {
        if (error.status === 401) {
          // The session ended. The uploaded files are still on the server; signing in and saving again links them.
          form.setError('root', { message: t('materials.form.sessionEnded') });
          return;
        }
        if (error.status === 404) {
          form.setError('root', { message: t('materials.form.missing') });
          onNotFound?.();
          return;
        }
        if (error.status === 400) {
          const violation = firstViolation(error.payload);
          if (violation?.field === 'title') {
            form.setError('title', {
              message: t('materials.form.titleRequired'),
            });
          } else if (violation?.field === 'fileIds') {
            form.setError('root', {
              message: t('materials.form.attachmentRejected'),
            });
          } else {
            form.setError('root', { message: t('materials.form.invalid') });
          }
          return;
        }
      }
      form.setError('root', { message: t('materials.form.saveFailed') });
    }
  });

  const rootError = form.formState.errors.root?.message;

  return (
    <form
      id={formId}
      className='space-y-6'
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      noValidate
    >
      {rootError ? (
        <Alert variant='destructive'>
          <AlertDescription>{rootError}</AlertDescription>
        </Alert>
      ) : null}

      <Field data-invalid={form.formState.errors.title ? true : undefined}>
        <FieldLabel htmlFor={`${formId}-title`}>
          {t('materials.form.title')}
        </FieldLabel>
        <Controller
          control={form.control}
          name='title'
          render={({ field }) => (
            <Input
              {...field}
              id={`${formId}-title`}
              aria-invalid={form.formState.errors.title ? true : undefined}
              placeholder={t('materials.form.titlePlaceholder')}
            />
          )}
        />
        {form.formState.errors.title ? (
          <FieldError errors={[form.formState.errors.title]} />
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor={`${formId}-description`}>
          {t('materials.form.description')}
        </FieldLabel>
        <Textarea
          {...form.register('description')}
          id={`${formId}-description`}
          placeholder={t('materials.form.descriptionPlaceholder')}
        />
        {form.formState.errors.description ? (
          <FieldError errors={[form.formState.errors.description]} />
        ) : null}
      </Field>

      <Field>
        <FieldLabel>{t('materials.form.attachments')}</FieldLabel>
        <FieldDescription>
          {t('materials.form.attachmentsHint', {
            max: Math.round(MATERIAL_FILE_MAX_SIZE / (1024 * 1024)),
          })}
        </FieldDescription>
        <FileList
          files={savedFiles}
          labels={fileLabels}
          emptyState={
            pendingFiles.length ? null : (
              <p className='text-sm text-muted-foreground'>
                {t('materials.files.empty')}
              </p>
            )
          }
          onRemove={(file) =>
            setSavedFiles((current) =>
              current.filter((candidate) => candidate.id !== file.id),
            )
          }
          onError={() =>
            toaster.show({
              type: 'error',
              title: t('materials.form.downloadFailed'),
            })
          }
        />
        <FileUploadField
          repository={repository}
          value={pendingFiles}
          onChange={(next) => setPendingFiles([...next])}
          onStatusChange={setUploadStatus}
          onError={() =>
            toaster.show({
              type: 'error',
              title: t('materials.form.uploadFailed'),
            })
          }
          multiple
          accept={MATERIAL_FILE_ACCEPT}
          maxSize={MATERIAL_FILE_MAX_SIZE}
          labels={fileLabels}
        />
        {uploadStatus === 'uploading' ? (
          <p className='text-sm text-muted-foreground' role='status'>
            {t('materials.form.uploading')}
          </p>
        ) : null}
        {uploadStatus === 'error' ? (
          <p className='text-sm text-destructive' role='status'>
            {t('materials.form.uploadFailedState')}
          </p>
        ) : null}
      </Field>
    </form>
  );
}
