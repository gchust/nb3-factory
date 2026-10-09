// The library list page's actual behavior: which rows it renders, whether it offers the create action, and whether it
// offers edit/delete for a record the server marked as read-only.
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { type ReactElement, type ReactNode } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LibraryDocumentsPage from '../../client/pages/library/index.js';
import enUS from '../../client/locales/en-US.js';

const { api, toaster } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));
// The page imports SessionExpiredAlert, which reads the authentication context through this module.
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ refresh: vi.fn() }),
}));

const runtime = await createTestI18nRuntime({
  application: { namespace: 'nb3-factory', resources: enUS },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

interface DocumentRow {
  id: string;
  title: string;
  body: string | null;
  ownerId: string;
  ownerName: string | null;
  published: boolean;
  confidential: boolean;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
}

function documentRow(overrides: Partial<DocumentRow>): DocumentRow {
  return {
    id: 'doc-1',
    title: 'Document',
    body: null,
    ownerId: 'user-1',
    ownerName: 'Librarian',
    published: true,
    confidential: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    canEdit: false,
    canDelete: false,
    ...overrides,
  };
}

function renderPage(): void {
  const router = createMemoryRouter(
    [
      {
        path: '/library',
        element: <LibraryDocumentsPage />,
        children: [{ path: 'new', element: <div /> }],
      },
    ],
    { initialEntries: ['/library'] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
}

describe('library list page', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  it('loads the list and offers the create action when the caller may create', async () => {
    api.request.mockResolvedValue({
      data: [
        documentRow({
          id: 'p',
          title: 'Public document P',
          canEdit: true,
          canDelete: true,
        }),
        documentRow({
          id: 'd',
          title: 'Private draft D',
          published: false,
          canEdit: true,
          canDelete: true,
        }),
      ],
      meta: { page: 1, pageSize: 100, total: 2, canCreate: true },
    });
    renderPage();

    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'library/documents' }),
    );
    expect(await screen.findByText('Public document P')).toBeInTheDocument();
    expect(screen.getByText('Private draft D')).toBeInTheDocument();
    // A Button rendered as a Link is announced as a button; the relative `new` resolves under the page.
    expect(
      screen.getByRole('button', { name: enUS.library.create.action }),
    ).toHaveAttribute('href', '/library/new');
  });

  it('hides the create action and the row menu from a read-only reader', async () => {
    api.request.mockResolvedValue({
      data: [
        documentRow({
          id: 'p',
          title: 'Public document P',
          canEdit: false,
          canDelete: false,
        }),
      ],
      meta: { page: 1, pageSize: 100, total: 1, canCreate: false },
    });
    renderPage();

    expect(await screen.findByText('Public document P')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: enUS.library.create.action }),
    ).not.toBeInTheDocument();
    // canEdit and canDelete are both false, so the actions cell renders no menu at all.
    expect(
      screen.queryByRole('button', {
        name: enUS.library.actions.more.replace(
          '{{title}}',
          'Public document P',
        ),
      }),
    ).not.toBeInTheDocument();
  });

  it('explains a 403 without offering a retry', async () => {
    const { ApiClientError } = await import('@nocobase/app-client');
    api.request.mockRejectedValue(
      new ApiClientError('Forbidden', {
        status: 403,
        method: 'GET',
        url: '/main/api/library/documents',
      }),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      enUS.library.error.forbidden,
    );
    expect(
      screen.queryByRole('button', { name: enUS['status.retry'] }),
    ).not.toBeInTheDocument();
  });

  it('offers a retry for a request failure', async () => {
    const { ApiClientError } = await import('@nocobase/app-client');
    api.request.mockRejectedValue(
      new ApiClientError('Server error', {
        status: 500,
        method: 'GET',
        url: '/main/api/library/documents',
      }),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      enUS.library.error.requestFailed,
    );
    expect(
      screen.getByRole('button', { name: enUS['status.retry'] }),
    ).toBeInTheDocument();
  });

  it('shows the empty state when there are no documents', async () => {
    api.request.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 100, total: 0, canCreate: false },
    });
    renderPage();

    expect(
      await screen.findByText(enUS.library.empty.title),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('status')).not.toBeInTheDocument(),
    );
  });
});
