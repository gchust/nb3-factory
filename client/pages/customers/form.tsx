import { useApiClient, useToaster, type ApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useCallback,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { useParams } from 'react-router';

import { createCustomer, getCustomer, updateCustomer } from '@/api/service';
import type { Customer } from '@/api/service-types';
import { RouteDialog } from '@/components/route-dialog';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { FormField } from '@/components/service/form-field';
import { useServiceOutlet } from '@/components/service/outlet-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { useServiceResource } from '@/hooks/use-service-resource';

interface CustomerFields {
  readonly name: string;
  readonly contactName: string;
  readonly contactPhone: string;
  readonly address: string;
  readonly remark: string;
}

const EMPTY: CustomerFields = {
  name: '',
  contactName: '',
  contactPhone: '',
  address: '',
  remark: '',
};

const FORM_ID = 'customer-form';

/**
 * Create or edit one customer.
 *
 * The same dialog serves both: the record id in the URL decides which, so the
 * form is addressable and a reload reopens it rather than dropping the user
 * back on the list.
 *
 * `useRouteOverlay()` may only be called inside the overlay, so the page that
 * returns `RouteDialog` owns only the submit state that gates closing; the
 * form body and the footer buttons are components within the dialog.
 */
export default function CustomerFormPage(): ReactElement {
  const { t } = useTranslation();
  const { customerId } = useParams();
  const id = customerId === undefined ? undefined : Number(customerId);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      beforeClose={() => !submittingRef.current}
      footer={<CustomerFormFooter submitting={submitting} />}
      title={
        id === undefined
          ? t('service.customers.createTitle')
          : t('service.customers.editTitle')
      }
    >
      <CustomerFormBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function CustomerFormBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { customerId } = useParams();
  const id = customerId === undefined ? undefined : Number(customerId);
  const { close } = useRouteOverlay();
  const { reload: reloadList } = useServiceOutlet();

  const load = useCallback(
    (client: ApiClient, signal: AbortSignal) =>
      id === undefined
        ? Promise.resolve<{ customer: Customer | null }>({ customer: null })
        : getCustomer(client, id, signal).then((customer) => ({ customer })),
    [id],
  );
  const existing = useServiceResource(`service-customer:${String(id)}`, load);
  const [draft, setDraft] = useState<CustomerFields | null>(null);
  const [error, setError] = useState<unknown>(null);

  const customer = existing.data?.customer ?? null;
  const form: CustomerFields =
    draft ??
    (customer
      ? {
          name: customer.name,
          contactName: customer.contactName ?? '',
          contactPhone: customer.contactPhone ?? '',
          address: customer.address ?? '',
          remark: customer.remark ?? '',
        }
      : EMPTY);

  function update<K extends keyof CustomerFields>(
    key: K,
    value: CustomerFields[K],
  ): void {
    setDraft({ ...form, [key]: value });
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (form.name.trim() === '') return;
    onSubmittingChange(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      contactName: form.contactName.trim() || null,
      contactPhone: form.contactPhone.trim() || null,
      address: form.address.trim() || null,
      remark: form.remark.trim() || null,
    };
    try {
      if (id === undefined) {
        await createCustomer(api, payload);
        toaster.show({
          type: 'success',
          title: t('service.customers.created'),
        });
      } else {
        await updateCustomer(api, id, payload);
        toaster.show({
          type: 'success',
          title: t('service.customers.updated'),
        });
      }
      reloadList();
      await close();
    } catch (submitError) {
      setError(submitError);
    } finally {
      onSubmittingChange(false);
    }
  }

  return (
    <>
      {existing.error ? (
        <ServiceErrorNotice error={existing.error} onRetry={existing.reload} />
      ) : null}
      {error ? <ServiceErrorNotice error={error} /> : null}
      {existing.isPending && id !== undefined ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Spinner aria-hidden='true' />
          {t('service.common.loading')}
        </div>
      ) : (
        <form
          className='grid gap-4'
          id={FORM_ID}
          onSubmit={(event) => void submit(event)}
        >
          <FormField
            htmlFor='customer-name'
            label={t('service.customers.name')}
            required
          >
            <Input
              id='customer-name'
              onChange={(event) => {
                update('name', event.target.value);
              }}
              required
              value={form.name}
            />
          </FormField>
          <div className='grid gap-4 sm:grid-cols-2'>
            <FormField
              htmlFor='customer-contact'
              label={t('service.customers.contactName')}
            >
              <Input
                id='customer-contact'
                onChange={(event) => {
                  update('contactName', event.target.value);
                }}
                value={form.contactName}
              />
            </FormField>
            <FormField
              htmlFor='customer-phone'
              label={t('service.customers.contactPhone')}
            >
              <Input
                id='customer-phone'
                onChange={(event) => {
                  update('contactPhone', event.target.value);
                }}
                value={form.contactPhone}
              />
            </FormField>
          </div>
          <FormField
            htmlFor='customer-address'
            label={t('service.customers.address')}
          >
            <Input
              id='customer-address'
              onChange={(event) => {
                update('address', event.target.value);
              }}
              value={form.address}
            />
          </FormField>
          <FormField
            htmlFor='customer-remark'
            label={t('service.customers.remark')}
          >
            <Textarea
              id='customer-remark'
              onChange={(event) => {
                update('remark', event.target.value);
              }}
              rows={3}
              value={form.remark}
            />
          </FormField>
        </form>
      )}
    </>
  );
}

function CustomerFormFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { customerId } = useParams();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        disabled={submitting}
        onClick={() => {
          void close();
        }}
        type='button'
        variant='ghost'
      >
        {t('service.actions.cancel')}
      </Button>
      <Button disabled={submitting} form={FORM_ID} type='submit'>
        {submitting ? <Spinner aria-hidden='true' /> : null}
        {customerId === undefined
          ? t('service.actions.create')
          : t('service.actions.save')}
      </Button>
    </>
  );
}
