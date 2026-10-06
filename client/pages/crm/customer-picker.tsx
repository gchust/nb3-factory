import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useEffect, useState } from 'react';

import { SessionExpiredAlert } from '@/components/session-expired-alert';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { CrmList, Customer, CustomerOption } from './types.js';

export interface CustomerPickerProps {
  readonly id: string;
  /** The selected customer's id as a string; an empty string when none is selected. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onBlur: () => void;
  readonly invalid: boolean;
}

/**
 * Choose the customer a contact or an opportunity belongs to. The options come from the customers endpoint, so a form
 * opened before the list has loaded still offers every customer.
 */
export function CustomerPicker({
  id,
  value,
  onChange,
  onBlur,
  invalid,
}: CustomerPickerProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{
    readonly key: number;
    readonly options?: CustomerOption[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = reloadCount;
    api
      .request<CrmList<Customer>>({
        path: 'customers',
        query: { pageSize: 100 },
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (controller.signal.aborted) return;
          setResult({
            key,
            options: data.map((customer) => ({
              value: customer.id,
              label: customer.name,
            })),
          });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setResult({ key, error });
        },
      );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== reloadCount;
  const error = loading ? undefined : result?.error;
  const options = result?.options ?? [];

  if (error instanceof ApiClientError && error.status === 401) {
    return <SessionExpiredAlert />;
  }
  if (error) {
    // The control has no dropdown to show an error in, so explain it in its place (guideline S4).
    const forbidden = error instanceof ApiClientError && error.status === 403;
    return (
      <div
        role='alert'
        className='flex items-center gap-2 text-sm text-destructive'
      >
        <span>
          {forbidden
            ? t('crm.customer.forbidden')
            : t('crm.customer.loadFailed')}
        </span>
        {forbidden ? null : (
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('status.retry')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <Select
      items={options}
      value={value || null}
      onValueChange={(next) => onChange(next == null ? '' : String(next))}
    >
      <SelectTrigger
        id={id}
        // Disabled until the options arrive, so an edit form never shows an id without its name.
        disabled={loading}
        className='w-full'
        aria-invalid={invalid}
        onBlur={onBlur}
      >
        <SelectValue
          placeholder={
            loading ? t('status.loading') : t('crm.customer.placeholder')
          }
        />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
