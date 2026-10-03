import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => ({ request: apiRequest }),
  useToaster: () => ({ show: vi.fn() }),
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

import { OpportunityForm } from '../../client/pages/crm/opportunity-form.tsx';

const CUSTOMERS = [
  { id: 1, name: 'Acme Manufacturing', industry: 'Manufacturing' },
  { id: 2, name: 'Globex Technology', industry: 'Information technology' },
];

describe('OpportunityForm', () => {
  it('refuses a negative expected amount', async () => {
    apiRequest.mockClear();
    apiRequest.mockResolvedValue({ data: CUSTOMERS });

    const { container } = render(
      <OpportunityForm formId='test-form' onSubmitted={vi.fn()} />,
    );

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith({
        path: 'customers',
        signal: expect.anything() as AbortSignal,
      });
    });

    fireEvent.change(container.querySelector('#test-form-name') as Element, {
      target: { value: 'Website redesign' },
    });
    fireEvent.change(container.querySelector('#test-form-amount') as Element, {
      target: { value: '-50' },
    });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByText('crm.form.amountInvalid')).toBeVisible();
    });
    // The only request so far is the customer list; nothing was submitted.
    expect(
      apiRequest.mock.calls.filter(([options]) => options.method === 'POST'),
    ).toEqual([]);
  });

  it('requires a customer to be chosen', async () => {
    apiRequest.mockClear();
    apiRequest.mockResolvedValue({ data: CUSTOMERS });

    const { container } = render(
      <OpportunityForm formId='test-form' onSubmitted={vi.fn()} />,
    );

    fireEvent.change(container.querySelector('#test-form-name') as Element, {
      target: { value: 'Website redesign' },
    });
    fireEvent.change(container.querySelector('#test-form-amount') as Element, {
      target: { value: '100' },
    });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByText('crm.form.customerRequired')).toBeVisible();
    });
    expect(
      apiRequest.mock.calls.filter(([options]) => options.method === 'POST'),
    ).toEqual([]);
  });
});
