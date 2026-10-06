import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor, within } from '@testing-library/react';
import { type ReactElement, type ReactNode } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import AssistantPage from '../../client/pages/assistant/index.js';
import DocumentDetailPage from '../../client/pages/documents/detail.js';
import DocumentsPage from '../../client/pages/documents/index.js';

interface Document {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly accessLevel: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const SHARED: Document = {
  id: 1,
  title: '蓝鹭设备报修电话',
  body: '蓝鹭设备报修电话为 400-000-7316。',
  accessLevel: 'staff',
  createdAt: '2026-10-06T00:00:00.000Z',
  updatedAt: '2026-10-06T00:00:00.000Z',
};
const INSPECTION: Document = {
  ...SHARED,
  id: 2,
  title: '蓝鹭设备常规巡检间隔',
  body: '蓝鹭设备常规巡检间隔为 45 天。',
};

// `vi.mock` factories run before this file's imports, so the doubles are created here. One object each, so a page's
// effect keeps one dependency identity across renders.
const { api, toaster, permission } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
  permission: { can: true, isPending: false, error: undefined as unknown },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module, so `ApiClientError` stays the class the page's `instanceof` checks against.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => ({
    can: permission.can,
    isPending: permission.isPending,
    error: permission.error,
    retry: vi.fn(),
  }),
}));

// The application's real copy, strict: a key it lacks fails the test instead of rendering as text.
const runtime = await createTestI18nRuntime({
  application: { namespace: 'nb3-factory', resources: enUS },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

/** The page as the application routes it: `/documents` with the record page as its child route. */
function renderAt(initialEntry: string): void {
  const router = createMemoryRouter(
    [
      {
        path: '/documents',
        element: <DocumentsPage />,
        children: [{ path: ':id', element: <DocumentDetailPage /> }],
      },
      { path: '/assistant', element: <AssistantPage /> },
    ],
    { initialEntries: [initialEntry] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
}

describe('documents pages', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
    permission.can = true;
    permission.isPending = false;
    permission.error = undefined;
  });

  it('lists the documents the caller may read, each linking to its own page', async () => {
    api.request.mockResolvedValue({ data: [SHARED, INSPECTION] });
    renderAt('/documents');

    const shared = await screen.findByRole(
      'link',
      { name: new RegExp(SHARED.title, 'u') },
      { timeout: 5_000 },
    );
    expect(shared).toHaveAttribute('href', '/documents/1');
    expect(
      screen.getByRole('link', { name: new RegExp(INSPECTION.title, 'u') }),
    ).toHaveAttribute('href', '/documents/2');
    // The excerpt is the body: the list shows what the document says, not only its title.
    expect(screen.getByText(/400-000-7316/u)).toBeInTheDocument();
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: 'documents' }),
    );
  });

  it('reports a failed load instead of showing an empty list', async () => {
    api.request.mockRejectedValue(new Error('offline'));
    renderAt('/documents');

    const alert = await screen.findByRole('alert', undefined, {
      timeout: 5_000,
    });
    expect(alert).toHaveTextContent(enUS.documents.loadError);
  });

  it('shows one document and offers the edit action where editing is allowed', async () => {
    api.request.mockResolvedValue({ data: SHARED });
    renderAt('/documents/1');

    expect(
      await screen.findByRole(
        'heading',
        { name: SHARED.title },
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole(
        'button',
        { name: enUS.documents.edit },
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: 'documents/1' }),
    );
  });

  it('hides the edit action from a caller without the edit permission', async () => {
    permission.can = false;
    api.request.mockResolvedValue({ data: SHARED });
    renderAt('/documents/1', 'documents');

    await screen.findByRole(
      'heading',
      { name: SHARED.title },
      { timeout: 5_000 },
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: enUS.documents.edit }),
      ).toBeNull();
    });
  });

  it('reports a document the caller cannot read as unavailable, never as forbidden', async () => {
    api.request.mockRejectedValue(
      new ApiClientError('Not Found', {
        status: 404,
        method: 'GET',
        url: '/api/documents/3',
      }),
    );
    renderAt('/documents/3');

    const alert = await screen.findByRole('alert', undefined, {
      timeout: 5_000,
    });
    expect(alert).toHaveTextContent(enUS.documents.notFound);
  });
});

describe('assistant page', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
    permission.can = true;
    permission.isPending = false;
  });

  it('states that the assistant is unavailable and keeps the documents reachable', async () => {
    // No AI route answers, which is the application with no LLM service configured: discovery fails and the page
    // must say so rather than mount a chat against nothing.
    api.request.mockRejectedValue(new Error('no AI service configured'));
    renderAt('/assistant');

    const alert = await screen.findByRole('alert', undefined, {
      timeout: 10_000,
    });
    expect(alert).toHaveTextContent(enUS.assistant.unavailableTitle);
    expect(
      within(alert).getByRole('link', { name: enUS.assistant.openDocuments }),
    ).toHaveAttribute('href', '/documents');
  });
});
