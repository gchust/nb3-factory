import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useId, useState, type FormEvent, type ReactElement } from 'react';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Input } from '@/components/ui/input';
import {
  DialogActions,
  ErrorBlock,
  Field,
  LoadingBlock,
  SimpleSelect,
} from '@/components/quality/parts';
import { useApiData } from '@/components/quality/use-api-data';
import {
  createBatch,
  fieldErrorMessages,
  formClasses,
  loadProducts,
  qualityErrorText,
  validateBatchDraft,
  withoutFieldError,
} from '@/components/quality/lib';

export default function CreateBatchPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog
      title={t('quality.batches.createTitle')}
      description={t('quality.batches.createDescription')}
    >
      <CreateBatchForm />
    </RouteDialog>
  );
}

function CreateBatchForm(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const formId = useId();
  const { close } = useRouteOverlay();
  const products = useApiData(loadProducts, 'products');
  const [productId, setProductId] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [productionLine, setProductionLine] = useState('');
  const [producedAt, setProducedAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();

  const options = (products.data ?? []).map((product) => ({
    value: product.id,
    label: `${product.code} ${product.name}`,
  }));

  function clearFieldError(field: string): void {
    setErrors((current) => withoutFieldError(current, field));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
    const validation = validateBatchDraft({
      productId,
      batchNo,
      quantity,
      producedAt,
    });
    if (validation.length > 0) {
      setErrors(fieldErrorMessages(validation, t));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await createBatch(api, {
        productId,
        batchNo,
        quantity: Number(quantity),
        productionLine: productionLine.trim() || null,
        producedAt: new Date(`${producedAt}T00:00:00.000Z`).toISOString(),
        remark: remark.trim() || null,
      });
      await close();
    } catch (submitError: unknown) {
      setError(qualityErrorText(submitError, t));
      setBusy(false);
    }
  }

  if (products.loading) return <LoadingBlock label={t('status.loading')} />;

  return (
    <form
      id={formId}
      noValidate
      className='space-y-4'
      onSubmit={(event) => void onSubmit(event)}
    >
      <Field
        label={t('quality.batches.field.product')}
        required
        error={errors.productId}
      >
        <SimpleSelect
          ariaLabel={t('quality.batches.field.product')}
          className='w-full'
          options={options}
          placeholder={t('quality.batches.field.selectProduct')}
          value={productId}
          onValueChange={(value) => {
            setProductId(value);
            clearFieldError('productId');
          }}
        />
      </Field>
      <Field
        label={t('quality.batches.field.batchNo')}
        htmlFor={`${formId}-no`}
        required
        error={errors.batchNo}
      >
        <Input
          id={`${formId}-no`}
          aria-invalid={Boolean(errors.batchNo)}
          value={batchNo}
          onChange={(event) => {
            setBatchNo(event.target.value);
            clearFieldError('batchNo');
          }}
        />
      </Field>
      <div className='grid grid-cols-2 gap-3'>
        <Field
          label={t('quality.batches.field.quantity')}
          htmlFor={`${formId}-qty`}
          required
          error={errors.quantity}
        >
          <Input
            id={`${formId}-qty`}
            aria-invalid={Boolean(errors.quantity)}
            min={1}
            type='number'
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value);
              clearFieldError('quantity');
            }}
          />
        </Field>
        <Field
          label={t('quality.batches.field.producedAt')}
          htmlFor={`${formId}-date`}
          required
          error={errors.producedAt}
        >
          <Input
            id={`${formId}-date`}
            aria-invalid={Boolean(errors.producedAt)}
            type='date'
            value={producedAt}
            onChange={(event) => {
              setProducedAt(event.target.value);
              clearFieldError('producedAt');
            }}
          />
        </Field>
      </div>
      <Field
        label={t('quality.batches.field.productionLine')}
        htmlFor={`${formId}-line`}
      >
        <Input
          id={`${formId}-line`}
          value={productionLine}
          onChange={(event) => setProductionLine(event.target.value)}
        />
      </Field>
      <Field
        label={t('quality.batches.field.remark')}
        htmlFor={`${formId}-remark`}
      >
        <textarea
          id={`${formId}-remark`}
          className={formClasses.textarea}
          rows={2}
          value={remark}
          onChange={(event) => setRemark(event.target.value)}
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
          submitLabel={t('quality.batches.submit')}
        />
      </div>
    </form>
  );
}
