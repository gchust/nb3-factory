import { zodResolver } from '@hookform/resolvers/zod';
import {
  ApiClientError,
  useApiClient,
  useService,
  useToaster,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CircleAlert } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  FileList,
  FileUploadField,
  clientFileRepositoryManagerToken,
  type FileRecord,
  type FileUploadStatus,
} from '@/extensions/nocobase-file-component-ui';

import { createMaterial, updateMaterial } from './materials-api.js';
import {
  MATERIAL_FILE_ACCEPT,
  MATERIAL_FILE_MAX_BYTES,
  MATERIAL_FILES_MAX,
  type Material,
} from './types.js';

export interface MaterialFormProps {
  /** The `<form>` id; a submit button outside the form sets `form={formId}`. */
  readonly formId: string;
  /** When editing, the latest record; omit it when creating. */
  readonly material?: Material;
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSubmitted: (material: Material) => void;
  /** `true` when a save starts, `false` when it ends; on success `false` comes before `onSubmitted`. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** `true` while an attachment is still uploading, so the container can keep Save disabled. */
  readonly onUploadingChange?: (uploading: boolean) => void;
  /** When editing, the endpoint answered `404` because the record was deleted. */
  readonly onNotFound?: () => void;
}

const MAX_TITLE_LENGTH = 255;

/**
 * The form create and edit share: a required title and the material's
 * attachments.
 *
 * Files are uploaded the moment they are chosen, before the material is
 * saved. The uploaded records are kept in component state, so a save that
 * fails validation (a missing title, say) loses nothing: the user adds the
 * title and saves again, and the same file ids are linked without uploading
 * them a second time.
 */
export function MaterialForm({
  formId,
  material,
  onSubmitted,
  onSubmittingChange,
  onUploadingChange,
  onNotFound,
}: MaterialFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const fileRepositoryManager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => fileRepositoryManager.repository('projectMaterialFiles'),
    [fileRepositoryManager],
  );

  const [files, setFiles] = useState<readonly FileRecord[]>(
    () => material?.files ?? [],
  );
  const [uploadStatus, setUploadStatus] = useState<FileUploadStatus>('idle');

  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('materials.form.titleRequired'))
          .max(
            MAX_TITLE_LENGTH,
            t('materials.form.titleTooLong', { max: MAX_TITLE_LENGTH }),
          ),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { title: material?.title ?? '' },
  });

  const handleUploadStatus = useCallback(
    (status: FileUploadStatus) => {
      setUploadStatus(status);
      onUploadingChange?.(status === 'uploading');
    },
    [onUploadingChange],
  );

  const handleUploadError = useCallback(
    (error: Error) => {
      console.error('Attachment upload failed', error);
      toaster.show({ type: 'error', title: t('materials.uploadFailed') });
    },
    [t, toaster],
  );

  const removeFile = useCallback((file: FileRecord) => {
    setFiles((current) => current.filter((item) => item.id !== file.id));
  }, []);

  const onSubmit = form.handleSubmit(async (values) => {
    const input = {
      title: values.title,
      fileIds: files.map((file) => file.id),
    };
    let saved: Material;
    onSubmittingChange?.(true);
    try {
      saved = material
        ? await updateMaterial(api, material.id, input)
        : await createMaterial(api, input);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 401) {
        form.setError('root', { type: 'sessionExpired' });
      } else if (material && apiError?.status === 404) {
        onNotFound?.();
      } else if (apiError?.status === 400) {
        form.setError('root', { message: t('materials.form.filesInvalid') });
      } else if (apiError?.status === 403) {
        form.setError('root', { message: t('materials.error.forbidden') });
      } else {
        form.setError('root', { message: t('materials.error.requestFailed') });
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

  useEffect(() => {
    return () => onUploadingChange?.(false);
  }, [onUploadingChange]);

  const rootError = form.formState.errors.root;
  const remaining = MATERIAL_FILES_MAX - files.length;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {rootError?.type === 'sessionExpired' ? (
          <Alert variant='destructive'>
            <CircleAlert />
            <AlertDescription>
              {t('materials.error.sessionExpired')}
            </AlertDescription>
          </Alert>
        ) : rootError ? (
          <Alert variant='destructive'>
            <CircleAlert />
            <AlertDescription>{rootError.message}</AlertDescription>
          </Alert>
        ) : null}
        <Controller
          control={form.control}
          name='title'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-title`}>
                {t('materials.fields.title')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-title`}
                autoComplete='off'
                aria-required='true'
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Field>
          <FieldTitle>{t('materials.fields.attachments')}</FieldTitle>
          <FileUploadField
            repository={repository}
            value={[]}
            onChange={(records) =>
              setFiles((current) => [...current, ...records])
            }
            onError={handleUploadError}
            onStatusChange={handleUploadStatus}
            multiple
            accept={MATERIAL_FILE_ACCEPT}
            maxSize={MATERIAL_FILE_MAX_BYTES}
            maxFiles={Math.max(remaining, 0)}
            disabled={remaining <= 0}
            labels={{ choose: t('materials.chooseFiles') }}
          />
          {uploadStatus === 'uploading' ? (
            <FieldDescription role='status'>
              {t('materials.uploading')}
            </FieldDescription>
          ) : uploadStatus === 'error' ? (
            <FieldDescription role='alert'>
              {t('materials.uploadFailed')}
            </FieldDescription>
          ) : null}
          <FileList
            files={files}
            onRemove={removeFile}
            onError={handleUploadError}
            emptyState={<p>{t('materials.attachmentsEmpty')}</p>}
            labels={{
              download: t('materials.download'),
              preview: t('materials.preview'),
              remove: t('materials.remove'),
            }}
          />
          <FieldDescription>
            {t('materials.form.attachmentsHint')}
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
