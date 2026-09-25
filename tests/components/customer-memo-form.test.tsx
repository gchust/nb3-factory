import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';
import { CustomerMemoForm } from '../../client/pages/customer-memos/customer-memo-form.js';
import type { CustomerMemo } from '../../client/pages/customer-memos/types.js';

const { requestMock, TestApiClientError, toastSuccess } = vi.hoisted(() => {
  class TestApiClientError extends Error {
    readonly status: number;
    readonly code?: string;

    constructor(status: number, code?: string) {
      super(code ?? String(status));
      this.status = status;
      this.code = code;
    }
  }

  return {
    requestMock: vi.fn(),
    TestApiClientError,
    toastSuccess: vi.fn(),
  };
});

vi.mock('@nocobase/app-client', () => ({
  ApiClientError: TestApiClientError,
  useApiClient: () => ({ request: requestMock }),
}));

vi.mock('sonner', () => ({
  toast: { success: toastSuccess, info: vi.fn() },
}));

async function englishRuntime(): Promise<I18nRuntime> {
  const value = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  value.registerApplicationNamespace('app', locales);
  await value.init('en-US');
  return value;
}

async function renderForm(props: {
  memo?: CustomerMemo;
  onSubmitted?: (memo: CustomerMemo) => void;
  onSubmittingChange?: (submitting: boolean) => void;
}): Promise<HTMLFormElement> {
  const value = await englishRuntime();
  const { container } = render(
    <I18nProvider runtime={value}>
      <CustomerMemoForm
        formId='memo-form'
        memo={props.memo}
        onSubmitted={props.onSubmitted ?? (() => {})}
        onSubmittingChange={props.onSubmittingChange}
      />
    </I18nProvider>,
  );
  const form = container.querySelector('form');
  if (!form) throw new Error('The form did not render.');
  return form;
}

const storedMemo: CustomerMemo = {
  id: 7,
  customerName: 'Acme Trading Co.',
  notes: 'Prefers email.',
  createdAt: '2025-11-03T09:15:00.000Z',
};

describe('CustomerMemoForm', () => {
  // Every case asserts on the calls of its own run; a leftover call or queued result from the previous one would
  // make the next pass or fail for the wrong reason.
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it('blocks an empty customer name with a clear message instead of sending it', async () => {
    const form = await renderForm({});

    fireEvent.submit(form);

    await expect(
      screen.findByText('Enter a customer name.'),
    ).resolves.toBeVisible();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('creates a memo with the trimmed name and no notes', async () => {
    const onSubmitted = vi.fn();
    const onSubmittingChange = vi.fn();
    requestMock.mockResolvedValueOnce({ data: storedMemo });
    const form = await renderForm({ onSubmitted, onSubmittingChange });

    fireEvent.change(screen.getByLabelText(/Customer name/u), {
      target: { value: '  Acme Trading Co.  ' },
    });
    fireEvent.submit(form);

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(storedMemo));
    expect(requestMock).toHaveBeenCalledWith({
      path: 'customer-memos',
      method: 'POST',
      json: { customerName: 'Acme Trading Co.', notes: null },
    });
    expect(onSubmittingChange.mock.calls).toEqual([[true], [false]]);
    // The form owns the success message; the page must not repeat it.
    expect(toastSuccess).toHaveBeenCalledWith(
      'Customer memo for Acme Trading Co. created.',
    );
  });

  it('edits the record the parent opened, sending a PATCH to its id', async () => {
    const onSubmitted = vi.fn();
    requestMock.mockResolvedValueOnce({
      data: { ...storedMemo, notes: null },
    });
    const form = await renderForm({ memo: storedMemo, onSubmitted });

    expect(screen.getByLabelText(/Customer name/u)).toHaveValue(
      'Acme Trading Co.',
    );
    expect(screen.getByLabelText(/Notes/u)).toHaveValue('Prefers email.');
    fireEvent.change(screen.getByLabelText(/Notes/u), {
      target: { value: '   ' },
    });
    fireEvent.submit(form);

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(requestMock).toHaveBeenCalledWith({
      path: 'customer-memos/7',
      method: 'PATCH',
      json: { customerName: 'Acme Trading Co.', notes: null },
    });
    expect(toastSuccess).toHaveBeenCalledWith(
      'Customer memo for Acme Trading Co. saved.',
    );
  });

  it('shows a translated message instead of the raw server failure', async () => {
    requestMock.mockRejectedValueOnce(new TestApiClientError(500));
    const form = await renderForm({});

    fireEvent.change(screen.getByLabelText(/Customer name/u), {
      target: { value: 'Acme Trading Co.' },
    });
    fireEvent.submit(form);

    await expect(
      screen.findByText('The request failed. Please try again.'),
    ).resolves.toBeVisible();
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
