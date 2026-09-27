import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { request, toastAdd, ApiClientError } = vi.hoisted(() => {
  class ApiClientError extends Error {
    readonly status: number;

    constructor(status: number) {
      super('api error');
      this.status = status;
    }
  }
  return { request: vi.fn(), toastAdd: vi.fn(), ApiClientError };
});

vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => ({ request }),
  ApiClientError,
}));

// The form only needs the key back; the real wording is covered by the locale
// coverage test.
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { add: toastAdd },
}));

import {
  TicketForm,
  type TicketFormProps,
} from '@/pages/it-requests/ticket-form';
import type { ItTicket } from '@/pages/it-requests/types';

/** A created record as the endpoint returns it. */
const ticket: ItTicket = {
  id: 9,
  title: 'Laptop will not start',
  category: 'computer',
  description: null,
  status: 'pending',
  resolution: null,
  createdAt: '2026-10-01T02:00:00.000Z',
  updatedAt: '2026-10-01T02:00:00.000Z',
  startedAt: null,
  completedAt: null,
  submitter: { id: 'u1', name: 'Zhang Wei' },
  handler: null,
};

function submitButton(): void {
  const form = document.querySelector('form');
  if (!form) throw new Error('form not rendered');
  fireEvent.submit(form);
}

beforeAll(() => {
  // Base UI's Select reaches for these while mounting, and jsdom has neither.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
});

describe('TicketForm', () => {
  beforeEach(() => {
    request.mockReset();
    toastAdd.mockReset();
  });

  function renderForm(
    overrides: Partial<TicketFormProps> = {},
  ): Pick<TicketFormProps, 'onSubmitted' | 'onSubmittingChange'> {
    const onSubmitted = vi.fn();
    const onSubmittingChange = vi.fn();
    render(
      <TicketForm
        formId='test-form'
        onSubmitted={onSubmitted}
        onSubmittingChange={onSubmittingChange}
        {...overrides}
      />,
    );
    return { onSubmitted, onSubmittingChange };
  }

  it('requires a title before calling the endpoint', async () => {
    renderForm();

    submitButton();

    expect(
      await screen.findByText('it.form.titleRequired'),
    ).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('creates a ticket and hands the record to the caller', async () => {
    request.mockResolvedValue({ data: ticket });
    const { onSubmitted } = renderForm();

    await userEvent.type(
      screen.getByLabelText(/it\.fields\.title/u),
      'Laptop will not start',
    );
    submitButton();

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(ticket));
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'it/tickets',
        method: 'POST',
        json: expect.objectContaining({
          title: 'Laptop will not start',
          category: 'computer',
        }),
      }),
    );
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: 'it.create.success' }),
    );
  });

  it('shows a permission error and keeps the caller from navigating', async () => {
    request.mockRejectedValue(new ApiClientError(403));
    const { onSubmitted } = renderForm();

    await userEvent.type(screen.getByLabelText(/it\.fields\.title/u), 'Broken');
    submitButton();

    expect(await screen.findByText('it.error.forbidden')).toBeInTheDocument();
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(toastAdd).not.toHaveBeenCalled();
  });

  it('reports submitting state around the request', async () => {
    let settle: ((value: { data: ItTicket }) => void) | undefined;
    request.mockImplementation(
      () =>
        new Promise<{ data: ItTicket }>((resolve) => {
          settle = resolve;
        }),
    );
    const { onSubmittingChange } = renderForm();

    await userEvent.type(screen.getByLabelText(/it\.fields\.title/u), 'Broken');
    submitButton();

    await waitFor(() => expect(onSubmittingChange).toHaveBeenCalledWith(true));
    settle?.({ data: ticket });
    await waitFor(() =>
      expect(onSubmittingChange).toHaveBeenLastCalledWith(false),
    );
  });
});
