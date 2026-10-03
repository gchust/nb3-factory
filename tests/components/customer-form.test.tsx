import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
const toasterShow = vi.hoisted(() => vi.fn());

vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => ({ request: apiRequest }),
  useToaster: () => ({ show: toasterShow }),
  ApiClientError: class ApiClientError extends Error {
    readonly status: number;
    readonly payload: unknown;
    constructor(message: string, status = 0, payload: unknown = undefined) {
      super(message);
      this.status = status;
      this.payload = payload;
    }
  },
}));

// Outside an `I18nProvider` the runtime returns default values verbatim; interpolate them the way the application does.
const translate = vi.hoisted(
  () =>
    (
      key: string,
      options?: Record<string, unknown> & { defaultValue?: string },
    ) =>
      (options?.defaultValue ?? key).replace(/{{(\w+)}}/g, (_, name: string) =>
        String(options?.[name]),
      ),
);

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: translate }),
}));

import { CustomerForm } from '../../client/pages/crm/customer-form.tsx';

describe('CustomerForm', () => {
  it('refuses a customer without a name', async () => {
    const { container } = render(
      <CustomerForm formId='test-form' onSubmitted={vi.fn()} />,
    );

    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByText('crm.form.nameRequired')).toBeVisible();
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('creates the customer and hands the saved record back', async () => {
    apiRequest.mockClear();
    toasterShow.mockClear();
    apiRequest.mockResolvedValue({
      data: { id: 7, name: 'Acme Manufacturing', industry: 'Manufacturing' },
    });
    const onSubmitted = vi.fn();

    const { container } = render(
      <CustomerForm formId='test-form' onSubmitted={onSubmitted} />,
    );

    const nameInput = container.querySelector<HTMLInputElement>(
      '#test-form-name',
    ) as HTMLInputElement;
    const industryInput = container.querySelector<HTMLInputElement>(
      '#test-form-industry',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, {
      target: { value: 'Acme Manufacturing' },
    });
    fireEvent.change(industryInput, {
      target: { value: 'Manufacturing' },
    });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(onSubmitted).toHaveBeenCalledWith({
        id: 7,
        name: 'Acme Manufacturing',
        industry: 'Manufacturing',
      });
    });
    expect(apiRequest).toHaveBeenCalledWith({
      path: 'customers',
      method: 'POST',
      json: { name: 'Acme Manufacturing', industry: 'Manufacturing' },
    });
    expect(toasterShow).toHaveBeenCalledWith({
      type: 'success',
      title: 'crm.customers.create.success',
    });
  });

  it('sends a blank industry as null and patches when editing', async () => {
    apiRequest.mockClear();
    apiRequest.mockResolvedValue({
      data: { id: 3, name: 'Globex', industry: null },
    });

    const { container } = render(
      <CustomerForm
        customer={{ id: 3, name: 'Globex', industry: 'Technology' }}
        formId='test-form'
        onSubmitted={vi.fn()}
      />,
    );

    const industryInput = container.querySelector<HTMLInputElement>(
      '#test-form-industry',
    ) as HTMLInputElement;
    fireEvent.change(industryInput, { target: { value: '' } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith({
        path: 'customers/3',
        method: 'PATCH',
        json: { name: 'Globex', industry: null },
      });
    });
  });
});
