import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';
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
import { FileUploadField } from '../../extensions/nocobase-file-component-ui/components/file-upload-field.js';
import type { FileRecord } from '../../extensions/nocobase-file-component-ui/types.js';
import {
  createMaterial,
  updateMaterial,
  useAttachmentRepository,
} from './api.js';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_SIZE,
  type ProjectMaterial,
} from './types.js';

const TITLE_MAX_LENGTH = 255;

export interface ProjectMaterialFormProps {
  /** The record being edited; omit it to create. */
  readonly material?: ProjectMaterial;
  /** The `<form>` id: the container puts the submit button outside the form and links it with `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. The form has already shown the success message. */
  readonly onSubmitted: (material: ProjectMaterial) => void;
  /** `true` while the request is in flight, so the container can disable its buttons. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** `true` while an attachment upload is in flight, so the container can keep Save disabled. */
  readonly onUploadingChange?: (uploading: boolean) => void;
  /** The record disappeared while editing. */
  readonly onNotFound?: () => void;
}

/**
 * The title and attachments of one material, shared by create and edit. The
 * uploaded files are held here rather than in the form state, so a save that
 * fails leaves them in place and the user can correct the title and save again
 * without uploading anything a second time.
 */
export function ProjectMaterialForm({
  material,
  formId,
  onSubmitted,
  onSubmittingChange,
  onUploadingChange,
  onNotFound,
}: ProjectMaterialFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const repository = useAttachmentRepository();
  const [attachments, setAttachments] = useState<readonly FileRecord[]>(
    material?.attachments ?? [],
  );

  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('projectMaterials.form.titleRequired'))
          .max(
            TITLE_MAX_LENGTH,
            t('projectMaterials.form.titleTooLong', {
              max: TITLE_MAX_LENGTH,
            }),
          ),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { title: material?.title ?? '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const input = {
      title: values.title,
      attachmentIds: attachments.map((attachment) => attachment.id),
    };
    let saved: ProjectMaterial;
    onSubmittingChange?.(true);
    try {
      saved = material
        ? await updateMaterial(api, material.id, input)
        : await createMaterial(api, input);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 400 && apiError.code === 'TITLE_REQUIRED') {
        form.setError(
          'title',
          { message: t('projectMaterials.form.titleRequired') },
          { shouldFocus: true },
        );
      } else if (
        apiError?.status === 400 &&
        apiError.code === 'TITLE_TOO_LONG'
      ) {
        form.setError(
          'title',
          {
            message: t('projectMaterials.form.titleTooLong', {
              max: TITLE_MAX_LENGTH,
            }),
          },
          { shouldFocus: true },
        );
      } else if (material && apiError?.status === 404) {
        onNotFound?.();
      } else {
        form.setError('root', {
          message: t('projectMaterials.form.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }

    toaster.show({
      type: 'success',
      title: material
        ? t('projectMaterials.form.updated')
        : t('projectMaterials.form.created'),
    });
    onSubmitted(saved);
  });

  const rootError = form.formState.errors.root?.message;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {rootError ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{rootError}</AlertDescription>
          </Alert>
        ) : null}
        <Controller
          control={form.control}
          name='title'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-title`}>
                {t('projectMaterials.fields.title')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-title`}
                aria-required='true'
                autoComplete='off'
                autoFocus
                aria-invalid={fieldState.invalid}
                placeholder={t('projectMaterials.fields.titlePlaceholder')}
              />
              {fieldState.invalid ? (
                <FieldError errors={[fieldState.error]} />
              ) : null}
            </Field>
          )}
        />
        <Field>
          <FieldLabel>{t('projectMaterials.fields.attachments')}</FieldLabel>
          <FileUploadField
            repository={repository}
            value={attachments}
            onChange={setAttachments}
            multiple
            accept={[...ATTACHMENT_ACCEPT]}
            maxSize={ATTACHMENT_MAX_SIZE}
            removeOnDelete={false}
            onStatusChange={(status) =>
              onUploadingChange?.(status === 'uploading')
            }
          />
          <FieldDescription>
            {t('projectMaterials.fields.attachmentsHint', {
              max: Math.round(ATTACHMENT_MAX_SIZE / (1024 * 1024)),
            })}
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
