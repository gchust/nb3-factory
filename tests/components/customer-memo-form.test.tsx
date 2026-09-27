import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Outside an `I18nProvider` the runtime returns default values verbatim, so
// returning the key itself lets the assertions name the message that shows.
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const api = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
}));

import { CustomerMemoForm } from '../../client/pages/customer-memos/customer-memo-form.tsx';

describe('customer memo form', () => {
  it('refuses to save a blank customer name and shows a prompt', async () => {
    api.request.mockReset();
    const onSubmitted = vi.fn();
    const { container } = render(
      <CustomerMemoForm
        formId='customer-memo-form'
        onSubmitted={onSubmitted}
      />,
    );

    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByText('customerMemos.form.nameRequired')).toBeVisible();
    });
    expect(api.request).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('creates a memo once the name is filled in', async () => {
    api.request.mockReset();
    api.request.mockResolvedValue({
      data: {
        id: 1,
        customerName: '新客户',
        note: null,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    });
    const onSubmitted = vi.fn();
    const { container } = render(
      <CustomerMemoForm
        formId='customer-memo-form'
        onSubmitted={onSubmitted}
      />,
    );

    fireEvent.change(
      screen.getByLabelText(/customerMemos.fields.customerName/),
      {
        target: { value: ' 新客户 ' },
      },
    );
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(api.request).toHaveBeenCalledWith({
        path: 'customer-memos',
        method: 'POST',
        json: { customerName: '新客户', note: null },
      });
    });
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
  });
});
