import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement, type ReactNode } from 'react';

import { FileUploadField } from '@/extensions/nocobase-file-component-ui/components/file-upload-field';
import type { FileRecord } from '@/extensions/nocobase-file-component-ui/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  productErrorMessage,
  useProductsApi,
  type ProductRecord,
  type ProductSaveInput,
} from '@/lib/products';
import { productFileLabels } from './file-labels.js';

/** Matches the per-file limit advertised by the upload endpoint. */
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export interface ProductFormProps {
  /** The product being edited; null for a new one. */
  readonly initial?: ProductRecord | null;
  /** Persists the form; rejections are shown inline. */
  readonly onSave: (values: ProductSaveInput) => Promise<void>;
  readonly submitLabel: string;
  readonly cancelLabel: string;
  readonly onCancel: () => void;
}

export function ProductForm({
  initial = null,
  onSave,
  submitLabel,
  cancelLabel,
  onCancel,
}: ProductFormProps): ReactElement {
  const { t } = useTranslation();
  const { imageRepository } = useProductsApi();

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [images, setImages] = useState<readonly FileRecord[]>(
    initial?.images ?? [],
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (): Promise<void> => {
    const values: ProductSaveInput = {
      name: name.trim(),
      description: description.trim() || null,
      imageFileIds: images.map((file) => file.id),
    };
    if (!values.name) {
      setError(t('products.errors.PRODUCT_NAME_REQUIRED'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(values);
    } catch (saveError) {
      setError(productErrorMessage(saveError, t));
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

      <Field label={t('products.fields.name')} required>
        <Input
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          disabled={disabled}
        />
      </Field>

      <Field label={t('products.fields.description')}>
        <Textarea
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
          disabled={disabled}
        />
      </Field>

      <Field
        label={t('products.fields.images')}
        hint={t('products.form.imagesHint')}
      >
        <FileUploadField
          repository={imageRepository}
          value={images}
          onChange={(next) => setImages([...(next ?? [])])}
          onStatusChange={(state) => setUploading(state === 'uploading')}
          onError={(uploadError) => setError(uploadError.message)}
          multiple
          maxSize={MAX_IMAGE_SIZE}
          maxFiles={20}
          removeOnDelete={false}
          labels={productFileLabels(t)}
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
