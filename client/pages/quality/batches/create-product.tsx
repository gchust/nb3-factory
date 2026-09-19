import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useId, useState, type FormEvent, type ReactElement } from 'react';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Input } from '@/components/ui/input';
import { DialogActions, ErrorBlock, Field } from '@/components/quality/parts';
import {
  createProduct,
  fieldErrorMessages,
  formClasses,
  qualityErrorText,
  validateProductDraft,
  withoutFieldError,
} from '@/components/quality/lib';

export default function CreateProductPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog
      title={t('quality.products.createTitle')}
      description={t('quality.products.createDescription')}
    >
      <CreateProductForm />
    </RouteDialog>
  );
}

function CreateProductForm(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const formId = useId();
  const { close } = useRouteOverlay();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [specification, setSpecification] = useState('');
  const [unit, setUnit] = useState('件');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();

  function clearFieldError(field: string): void {
    setErrors((current) => withoutFieldError(current, field));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
    const validation = validateProductDraft({ code, name, unit });
    if (validation.length > 0) {
      setErrors(fieldErrorMessages(validation, t));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await createProduct(api, {
        code,
        name,
        specification: specification.trim() || null,
        unit,
      });
      await close();
    } catch (submitError: unknown) {
      setError(qualityErrorText(submitError, t));
      setBusy(false);
    }
  }

  return (
    <form
      id={formId}
      noValidate
      className='space-y-4'
      onSubmit={(event) => void onSubmit(event)}
    >
      <Field
        label={t('quality.products.field.code')}
        htmlFor={`${formId}-code`}
        required
        error={errors.code}
      >
        <Input
          id={`${formId}-code`}
          aria-invalid={Boolean(errors.code)}
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            clearFieldError('code');
          }}
        />
      </Field>
      <Field
        label={t('quality.products.field.name')}
        htmlFor={`${formId}-name`}
        required
        error={errors.name}
      >
        <Input
          id={`${formId}-name`}
          aria-invalid={Boolean(errors.name)}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            clearFieldError('name');
          }}
        />
      </Field>
      <Field
        label={t('quality.products.field.specification')}
        htmlFor={`${formId}-spec`}
      >
        <Input
          id={`${formId}-spec`}
          value={specification}
          onChange={(event) => setSpecification(event.target.value)}
        />
      </Field>
      <Field
        label={t('quality.products.field.unit')}
        htmlFor={`${formId}-unit`}
        required
        error={errors.unit}
      >
        <Input
          id={`${formId}-unit`}
          aria-invalid={Boolean(errors.unit)}
          value={unit}
          onChange={(event) => {
            setUnit(event.target.value);
            clearFieldError('unit');
          }}
        />
      </Field>
      {Object.keys(errors).length > 0 ? (
        <ErrorBlock message={t('quality.validation.fixFields')} />
      ) : null}
      {error ? <ErrorBlock message={error} /> : null}
      <div className={formClasses.actions}>
        <DialogActions
          busy={busy}
          formId={formId}
          submitLabel={t('quality.products.submit')}
        />
      </div>
    </form>
  );
}
