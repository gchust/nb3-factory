import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
  NamespaceScope: ({ children }: { children: ReactNode }) => children,
}));

import { DeliveryFileList } from '../../client/components/delivery/file-list.js';
import { FilePreviewDialog } from '../../client/components/delivery/file-preview.js';

const file = {
  id: 'f1',
  filename: 'clip.txt',
  ext: 'txt',
  mimeType: 'text/plain',
  size: 12,
  createdAt: '2026-09-19T00:00:00.000Z',
  contentUrl: '/main/uploads/delivery-files/f1.txt',
};

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

function hasNativeButtonWarning(spy: ReturnType<typeof vi.spyOn>): boolean {
  return spy.mock.calls.some((call) =>
    call.some(
      (argument) =>
        typeof argument === 'string' && argument.includes('nativeButton'),
    ),
  );
}

/**
 * Base UI's Button defaults to `nativeButton` and warns when `render` swaps in
 * a non-<button>. The download control is an anchor so the browser can save
 * the file, so the files list has to opt out explicitly; otherwise every
 * project, task and submission detail page logs the warning.
 */
describe('delivery file download controls', () => {
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    error.mockRestore();
  });

  it('renders the download control as an anchor without the Base UI warning', () => {
    renderWithQuery(<DeliveryFileList files={[file]} />);

    const link = screen.getByLabelText(
      `delivery.file.download ${file.filename}`,
    );
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', file.contentUrl);
    expect(link).toHaveAttribute('download', file.filename);
    expect(hasNativeButtonWarning(error)).toBe(false);
  });

  it('renders the preview download control without the Base UI warning', () => {
    renderWithQuery(
      <FilePreviewDialog file={file} onClose={() => undefined} />,
    );

    const link = screen.getByText('delivery.file.download').closest('a');
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute('download', file.filename);
    expect(hasNativeButtonWarning(error)).toBe(false);
  });
});
