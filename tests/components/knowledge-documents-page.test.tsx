import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import KnowledgeDocumentsPage from '@/pages/knowledge-documents/index.js';

import enUS from '../../client/locales/en-US.js';

// `vi.mock` factories run before this file's imports and code, so the objects they close over are created here.
const { api, permission } = vi.hoisted(() => ({
  // One client object for the file: a new one per call would restart the page's effect.
  api: { request: vi.fn() },
  // What `useCan` returns; each test sets `can` before rendering.
  permission: { can: false, isPending: false, error: undefined as unknown },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module, so `ApiClientError` stays the class the page checks with `instanceof`.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => ({ ...permission, retry: vi.fn() }),
}));

// The real application runtime, strict: a key the locale files lack fails the test instead of rendering as text.
const runtime = await createTestI18nRuntime({
  application: { namespace: 'nb3-factory', resources: enUS },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

const publicDocument = {
  id: 1,
  title: '蓝鹭设备报修电话',
  body: '蓝鹭设备报修电话为 400-000-7316。',
  visibility: 'public' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};
const restrictedDocument = {
  id: 2,
  title: '保密项目内部代号',
  body: '保密项目的内部代号为墨竹 729。',
  visibility: 'restricted' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

function renderPage(): void {
  render(<KnowledgeDocumentsPage />, { wrapper: I18n });
}

function listResponse(documents: readonly (typeof publicDocument)[]) {
  return { data: documents, meta: { total: documents.length } };
}

describe('knowledge documents page', () => {
  beforeEach(() => {
    api.request.mockReset();
    permission.can = false;
    permission.isPending = false;
  });

  it('loads the permission-scoped list and labels each document', async () => {
    api.request.mockResolvedValue(
      listResponse([publicDocument, restrictedDocument]),
    );
    renderPage();

    expect(screen.getByText(enUS['status.loadingPage'])).toBeInTheDocument();
    expect(await screen.findByText(publicDocument.title)).toBeInTheDocument();
    expect(screen.getByText(restrictedDocument.title)).toBeInTheDocument();
    // A colleague receives the restricted row too when it is theirs to read; the page shows what it was given.
    expect(
      screen.getAllByText(enUS.knowledge.documents.visibility.public).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(enUS.knowledge.documents.visibility.restricted),
    ).toBeInTheDocument();
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'knowledge/documents' }),
    );
  });

  it('offers no edit control without the manage grant', async () => {
    api.request.mockResolvedValue(listResponse([publicDocument]));
    renderPage();
    await screen.findByText(publicDocument.title);

    expect(
      screen.queryByRole('button', {
        name: enUS.knowledge.documents.edit.action,
      }),
    ).not.toBeInTheDocument();
  });

  it('opens the edit dialog with the manage grant and saves a change', async () => {
    permission.can = true;
    api.request.mockImplementation((options: { readonly method?: string }) =>
      Promise.resolve(
        options.method === 'PATCH'
          ? {
              data: {
                ...publicDocument,
                title: '蓝鹭设备报修电话（更新）',
              },
            }
          : listResponse([publicDocument]),
      ),
    );
    renderPage();

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: enUS.knowledge.documents.edit.action,
      }),
    );
    expect(
      await screen.findByRole('dialog', {
        name: enUS.knowledge.documents.edit.title,
      }),
    ).toBeInTheDocument();

    const titleInput = screen.getByLabelText(
      enUS.knowledge.documents.field.title,
    );
    await user.clear(titleInput);
    await user.type(titleInput, '蓝鹭设备报修电话（更新）');
    await user.click(screen.getByRole('button', { name: enUS.actions.save }));

    expect(
      await screen.findByText('蓝鹭设备报修电话（更新）'),
    ).toBeInTheDocument();
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PATCH',
        path: `knowledge/documents/${publicDocument.id}`,
        json: {
          title: '蓝鹭设备报修电话（更新）',
          body: publicDocument.body,
        },
      }),
    );
  });

  it('shows the forbidden message and a retry that reloads the list', async () => {
    api.request.mockRejectedValueOnce(
      new ApiClientError('Forbidden', {
        status: 403,
        reason: 'AUTHORIZATION_DENIED',
        method: 'GET',
        url: '/api/knowledge/documents',
      }),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      enUS.knowledge.documents.errors.forbidden,
    );

    api.request.mockResolvedValueOnce(listResponse([publicDocument]));
    await userEvent.click(
      screen.getByRole('button', { name: enUS['status.retry'] }),
    );

    expect(await screen.findByText(publicDocument.title)).toBeInTheDocument();
    expect(api.request).toHaveBeenCalledTimes(2);
  });
});
