import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';
import { CustomerMemoDeleteDialog } from '../../client/pages/customer-memos/customer-memo-delete-dialog.js';

const { requestMock, TestApiClientError, toastSuccess, toastInfo } = vi.hoisted(
  () => {
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
      toastInfo: vi.fn(),
    };
  },
);

vi.mock('@nocobase/app-client', () => ({
  ApiClientError: TestApiClientError,
  useApiClient: () => ({ request: requestMock }),
}));

vi.mock('sonner', () => ({
  toast: { success: toastSuccess, info: toastInfo },
}));

async function renderDialog(props: {
  onDeleted?: () => void;
}): Promise<{ onOpenChange: ReturnType<typeof vi.fn> }> {
  const value = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  value.registerApplicationNamespace('app', locales);
  await value.init('en-US');
  const onOpenChange = vi.fn();
  render(
    <I18nProvider runtime={value}>
      <CustomerMemoDeleteDialog
        open
        onOpenChange={onOpenChange}
        memo={{ id: 7, customerName: 'Acme Trading Co.' }}
        onDeleted={props.onDeleted ?? (() => {})}
      />
    </I18nProvider>,
  );
  return { onOpenChange };
}

describe('CustomerMemoDeleteDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('cancels without deleting anything', async () => {
    const onDeleted = vi.fn();
    const { onOpenChange } = await renderDialog({ onDeleted });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(requestMock).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('deletes the record after the confirmation', async () => {
    const onDeleted = vi.fn();
    requestMock.mockResolvedValueOnce({ data: { deleted: true } });
    await renderDialog({ onDeleted });

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(requestMock).toHaveBeenCalledWith({
      path: 'customer-memos/7',
      method: 'DELETE',
    });
    expect(toastSuccess).toHaveBeenCalledWith(
      'Customer memo for Acme Trading Co. deleted.',
    );
  });

  it('treats an already deleted record as success', async () => {
    const onDeleted = vi.fn();
    requestMock.mockRejectedValueOnce(new TestApiClientError(404));
    await renderDialog({ onDeleted });

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(toastInfo).toHaveBeenCalledWith(
      'This customer memo was already deleted.',
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('keeps the record and explains a failed delete', async () => {
    const onDeleted = vi.fn();
    requestMock.mockRejectedValueOnce(new TestApiClientError(500));
    await renderDialog({ onDeleted });

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await expect(
      screen.findByText('The request failed. Please try again.'),
    ).resolves.toBeVisible();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
