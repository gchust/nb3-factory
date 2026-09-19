import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus, Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactElement } from 'react';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DialogActions,
  EmptyBlock,
  ErrorBlock,
  Field,
  FieldError,
  LoadingBlock,
  SimpleSelect,
} from '@/components/quality/parts';
import { useApiData } from '@/components/quality/use-api-data';
import {
  createTask,
  fieldErrorMessages,
  formClasses,
  itemFieldErrorKey,
  loadAssignableUsers,
  loadBatches,
  qualityErrorText,
  tableClasses,
  validateTaskDraft,
  withoutFieldError,
} from '@/components/quality/lib';

interface ItemDraft {
  readonly key: string;
  name: string;
  method: string;
  standard: string;
  unit: string;
}

function newItem(): ItemDraft {
  return {
    key: crypto.randomUUID(),
    name: '',
    method: '',
    standard: '',
    unit: '',
  };
}

export default function CreateTaskPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog
      title={t('quality.tasks.createTitle')}
      description={t('quality.tasks.createDescription')}
    >
      <CreateTaskForm />
    </RouteDialog>
  );
}

function CreateTaskForm(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const formId = useId();
  const { close } = useRouteOverlay();
  const source = useApiData(async (client) => {
    const [batches, users] = await Promise.all([
      loadBatches(client),
      loadAssignableUsers(client),
    ]);
    return { batches, users };
  }, 'task-create');
  const [batchId, setBatchId] = useState('');
  const [inspectorId, setInspectorId] = useState('');
  const [assignedLeadId, setAssignedLeadId] = useState('');
  const [sampleSize, setSampleSize] = useState('10');
  const [remark, setRemark] = useState('');
  const [items, setItems] = useState<readonly ItemDraft[]>(() => [newItem()]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();

  const batchOptions = (source.data?.batches ?? []).map((batch) => ({
    value: batch.id,
    label: `${batch.batchNo} · ${batch.productCode} ${batch.productName}`,
  }));
  const inspectorOptions = (source.data?.users.inspectors ?? []).map(
    (user) => ({
      value: user.id,
      label: user.name,
    }),
  );
  const leadOptions = (source.data?.users.productionLeads ?? []).map(
    (user) => ({
      value: user.id,
      label: user.name,
    }),
  );

  function clearFieldError(field: string): void {
    setErrors((current) => withoutFieldError(current, field));
  }

  function updateItem(key: string, patch: Partial<ItemDraft>): void {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
    clearFieldError(itemFieldErrorKey(key));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
    const validation = validateTaskDraft({
      batchId,
      inspectorId,
      assignedLeadId,
      sampleSize,
      items,
    });
    if (validation.length > 0) {
      setErrors(fieldErrorMessages(validation, t));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await createTask(api, {
        batchId,
        inspectorId,
        assignedLeadId,
        sampleSize: Number(sampleSize),
        remark: remark.trim() || null,
        items: items.map((item) => ({
          name: item.name,
          method: item.method.trim() || null,
          standard: item.standard.trim() || null,
          unit: item.unit.trim() || null,
        })),
      });
      await close();
    } catch (submitError: unknown) {
      setError(qualityErrorText(submitError, t));
      setBusy(false);
    }
  }

  if (source.loading) return <LoadingBlock label={t('status.loading')} />;
  if (source.error) {
    return <ErrorBlock message={source.error} onRetry={source.reload} />;
  }

  return (
    <form
      id={formId}
      noValidate
      className='space-y-4'
      onSubmit={(event) => void onSubmit(event)}
    >
      <Field
        label={t('quality.tasks.field.batch')}
        required
        error={errors.batchId}
      >
        <SimpleSelect
          ariaLabel={t('quality.tasks.field.batch')}
          className='w-full'
          options={batchOptions}
          placeholder={t('quality.tasks.field.selectBatch')}
          value={batchId}
          onValueChange={(value) => {
            setBatchId(value);
            clearFieldError('batchId');
          }}
        />
      </Field>
      <div className='grid grid-cols-2 gap-3'>
        <Field
          label={t('quality.tasks.field.inspector')}
          required
          error={errors.inspectorId}
        >
          <SimpleSelect
            ariaLabel={t('quality.tasks.field.inspector')}
            className='w-full'
            options={inspectorOptions}
            placeholder={t('quality.tasks.field.selectInspector')}
            value={inspectorId}
            onValueChange={(value) => {
              setInspectorId(value);
              clearFieldError('inspectorId');
            }}
          />
        </Field>
        <Field
          label={t('quality.tasks.field.productionLead')}
          required
          error={errors.assignedLeadId}
        >
          <SimpleSelect
            ariaLabel={t('quality.tasks.field.productionLead')}
            className='w-full'
            options={leadOptions}
            placeholder={t('quality.tasks.field.selectLead')}
            value={assignedLeadId}
            onValueChange={(value) => {
              setAssignedLeadId(value);
              clearFieldError('assignedLeadId');
            }}
          />
        </Field>
      </div>
      <div className='grid grid-cols-2 gap-3'>
        <Field
          label={t('quality.tasks.field.sampleSize')}
          htmlFor={`${formId}-sample`}
          required
          error={errors.sampleSize}
        >
          <Input
            id={`${formId}-sample`}
            aria-invalid={Boolean(errors.sampleSize)}
            min={1}
            type='number'
            value={sampleSize}
            onChange={(event) => {
              setSampleSize(event.target.value);
              clearFieldError('sampleSize');
            }}
          />
        </Field>
        <Field
          label={t('quality.tasks.field.remark')}
          htmlFor={`${formId}-remark`}
        >
          <Input
            id={`${formId}-remark`}
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
          />
        </Field>
      </div>

      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <span className='text-sm font-medium'>
            {t('quality.tasks.field.items')}
          </span>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => setItems((current) => [...current, newItem()])}
          >
            <Plus aria-hidden='true' />
            {t('quality.tasks.addItem')}
          </Button>
        </div>
        {items.length === 0 ? (
          <EmptyBlock message={t('quality.tasks.noItems')} />
        ) : (
          <div className={tableClasses.wrap}>
            <table className={tableClasses.table}>
              <thead>
                <tr className={tableClasses.headRow}>
                  <th className={tableClasses.headCell}>
                    {t('quality.tasks.item.name')}
                  </th>
                  <th className={tableClasses.headCell}>
                    {t('quality.tasks.item.method')}
                  </th>
                  <th className={tableClasses.headCell}>
                    {t('quality.tasks.item.standard')}
                  </th>
                  <th className={tableClasses.headCell}>
                    {t('quality.tasks.item.unit')}
                  </th>
                  <th className={tableClasses.headCell} />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.key} className={tableClasses.row}>
                    <td className={tableClasses.cell}>
                      <Input
                        aria-label={t('quality.tasks.item.name')}
                        aria-invalid={Boolean(
                          errors[itemFieldErrorKey(item.key)],
                        )}
                        value={item.name}
                        onChange={(event) =>
                          updateItem(item.key, { name: event.target.value })
                        }
                      />
                      <FieldError>
                        {errors[itemFieldErrorKey(item.key)]}
                      </FieldError>
                    </td>
                    <td className={tableClasses.cell}>
                      <Input
                        aria-label={t('quality.tasks.item.method')}
                        value={item.method}
                        onChange={(event) =>
                          updateItem(item.key, { method: event.target.value })
                        }
                      />
                    </td>
                    <td className={tableClasses.cell}>
                      <Input
                        aria-label={t('quality.tasks.item.standard')}
                        value={item.standard}
                        onChange={(event) =>
                          updateItem(item.key, { standard: event.target.value })
                        }
                      />
                    </td>
                    <td className={tableClasses.cell}>
                      <Input
                        aria-label={t('quality.tasks.item.unit')}
                        className='w-20'
                        value={item.unit}
                        onChange={(event) =>
                          updateItem(item.key, { unit: event.target.value })
                        }
                      />
                    </td>
                    <td className={tableClasses.cell}>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-sm'
                        aria-label={t('quality.tasks.removeItem')}
                        disabled={items.length <= 1}
                        onClick={() =>
                          setItems((current) =>
                            current.filter((entry) => entry.key !== item.key),
                          )
                        }
                      >
                        <Trash2 aria-hidden='true' />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {Object.keys(errors).length > 0 ? (
        <ErrorBlock message={t('quality.validation.fixFields')} />
      ) : null}
      {error ? <ErrorBlock message={error} /> : null}
      <div className={formClasses.actions}>
        <DialogActions
          busy={busy}
          formId={formId}
          submitLabel={t('quality.tasks.submit')}
        />
      </div>
    </form>
  );
}
