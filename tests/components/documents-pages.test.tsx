import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DocumentDetailPage from '../../client/pages/documents/detail.js';
import DocumentsPage from '../../client/pages/documents/index.js';
import type { DocumentItem } from '../../client/pages/documents/types.js';
import enUS from '../../client/locales/en-US.js';

const { api, toaster, permissions } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
  permissions: {
    allowed: new Set<string>(),
    unrestricted: false,
  },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: { user: { id: 'jia', name: '资料员甲' } },
    refresh: vi.fn(),
  }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: (
    permission:
      string | { readonly action: string; readonly resource: unknown },
  ) => {
    const action =
      typeof permission === 'string' ? permission : permission.action;
    return {
      can:
        action === 'unrestricted'
          ? permissions.unrestricted
          : permissions.allowed.has(action),
      isPending: false,
      error: undefined,
      retry: vi.fn(),
    };
  },
}));

const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

const publicDocument: DocumentItem = {
  id: 'p',
  title: '公开资料 P',
  body: '这是虚构资料 P 的正文。',
  ownerId: 'jia',
  ownerName: '资料员甲',
  published: true,
  confidential: false,
  createdAt: '2026-10-27T00:00:00.000Z',
  updatedAt: '2026-10-27T00:00:00.000Z',
};

const draftDocument: DocumentItem = {
  ...publicDocument,
  id: 'd',
  title: '私有草稿 D',
  body: '这是虚构草稿 D 的正文。',
  published: false,
};

const confidentialDocument: DocumentItem = {
  ...publicDocument,
  id: 'c',
  title: '保密资料 C',
  body: '这是虚构保密资料 C 的正文。',
  confidential: true,
};

function renderAt(url: string, path: string, element: ReactElement): void {
  const router = createMemoryRouter([{ path, element }], {
    initialEntries: [url],
  });
  render(<RouterProvider router={router} />, { wrapper: I18n });
}

describe('document pages', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
    permissions.allowed = new Set<string>();
    permissions.unrestricted = false;
  });

  it('offers an owner the new-document action and marks confidential documents', async () => {
    permissions.allowed = new Set(['view', 'create']);
    api.request.mockResolvedValue({
      data: [publicDocument, confidentialDocument],
      meta: { total: 2 },
    });

    renderAt('/documents', '/documents', <DocumentsPage />);

    expect(await screen.findByText('公开资料 P')).toBeInTheDocument();
    expect(screen.getByText('保密资料 C')).toBeInTheDocument();
    expect(
      screen.getByText(enUS.documents.badges.confidential),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: enUS.documents.actions.new }),
    ).toHaveAttribute('href', '/documents/new');
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'documents' }),
    );
  });

  it('shows a reader the published document without create or edit controls', async () => {
    permissions.allowed = new Set(['view']);
    api.request.mockResolvedValue({
      data: [publicDocument],
      meta: { total: 1 },
    });

    renderAt('/documents', '/documents', <DocumentsPage />);

    expect(await screen.findByText('公开资料 P')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: enUS.documents.actions.new }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(enUS.documents.badges.confidential),
    ).not.toBeInTheDocument();
  });

  it('lets a shared reader open the body but offers neither edit nor sharing', async () => {
    permissions.allowed = new Set(['view']);
    api.request.mockResolvedValue({ data: draftDocument });

    renderAt('/documents/d', '/documents/:documentId', <DocumentDetailPage />);

    expect(
      await screen.findByText('这是虚构草稿 D 的正文。'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: enUS.documents.actions.edit }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(enUS.documents.share.title),
    ).not.toBeInTheDocument();
  });

  it('marks a confidential document and blocks sharing it', async () => {
    permissions.allowed = new Set(['view', 'edit', 'share']);
    api.request.mockResolvedValue({ data: confidentialDocument });

    renderAt('/documents/c', '/documents/:documentId', <DocumentDetailPage />);

    expect(
      await screen.findByText('这是虚构保密资料 C 的正文。'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enUS.documents.detail.confidentialNotice),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enUS.documents.share.confidentialBlocked),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(enUS.documents.share.title),
    ).not.toBeInTheDocument();
  });

  it('denies a page opened without the view action and does not request documents', () => {
    renderAt('/documents', '/documents', <DocumentsPage />);

    expect(screen.getByText(enUS.documents.errors.denied)).toBeInTheDocument();
    expect(api.request).not.toHaveBeenCalled();
  });
});
