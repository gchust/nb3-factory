// The Document Center administration overlays and the employee preview. The
// two overlays regressed by calling `useRouteOverlay` from the page that
// renders the dialog rather than from a component inside it, so these tests
// render them through a real router and assert their content appears. The
// preview's version history must show who changed each version and, for a user
// who may manage the center, offer a restore.
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode } from 'react';
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DocumentPreviewPage from '@/pages/documents/document-preview';
import BackupRestorePage from '@/pages/settings/document-center/backup-restore';
import DocumentVersionsPage from '@/pages/settings/document-center/document-versions';

import enUS from '../../client/locales/en-US.js';

const { api, toaster, permission } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
  // What `useCan` returns; the preview shows Restore only when it is allowed.
  permission: { can: true },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => ({
    can: permission.can,
    isPending: false,
    error: undefined,
    retry: vi.fn(),
  }),
}));

const runtime = await createTestI18nRuntime({
  application: { namespace: 'nb3-factory', resources: enUS },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

/** The page under test as the application routes it: a child of a page that supplies the overlay's outlet context. */
function renderAt(
  element: ReactElement,
  url: string,
  context: { readonly reload: () => void },
) {
  const router = createMemoryRouter(
    [
      {
        path: '/settings/document-center/documents',
        element: <Outlet context={context} />,
        children: [{ path: ':documentId/versions', element }],
      },
      {
        path: '/settings/document-center/backups',
        element: <Outlet context={context} />,
        children: [{ path: ':backupId/restore', element }],
      },
      {
        path: '/documents',
        element: <Outlet context={context} />,
        children: [{ path: ':documentId', element }],
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
  return router;
}

const versions = [
  {
    id: 12,
    documentId: 7,
    version: 2,
    title: '差旅费报销管理办法',
    category: 'policy' as const,
    summary: null,
    content: 'version 2',
    visibility: 'all' as const,
    departmentIds: [],
    changeNote: 'QA修改内容生成版本2',
    createdById: 'user-2',
    createdByName: 'Bob',
    createdAt: '2026-02-02T03:00:00.000Z',
  },
  {
    id: 11,
    documentId: 7,
    version: 1,
    title: '差旅费报销管理办法',
    category: 'policy' as const,
    summary: null,
    content: 'version 1',
    visibility: 'all' as const,
    departmentIds: [],
    changeNote: null,
    createdById: 'user-1',
    createdByName: 'Alice',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const detail = {
  id: 7,
  code: 'travel-reimbursement',
  title: '差旅费报销管理办法',
  category: 'policy' as const,
  summary: '出差申请、费用标准、报销流程与票据要求。',
  status: 'published' as const,
  visibility: 'all' as const,
  version: 2,
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-02T03:00:00.000Z',
  departmentIds: [],
  content: 'version 2',
  createdById: 'user-1',
  updatedById: 'user-2',
  deletedById: null,
};

const impact = {
  backup: {
    id: 1,
    title: 'QA backup',
    documentCount: 1,
    versionCount: 2,
    createdById: 'user-1',
    createdAt: '2026-02-03T00:00:00.000Z',
  },
  summary: {
    create: 0,
    update: 1,
    restore: 0,
    delete: 0,
    unchanged: 0,
    total: 1,
  },
  documents: [
    {
      documentId: 7,
      title: detail.title,
      code: detail.code,
      action: 'update' as const,
    },
  ],
};

function mockDocumentVersions(): void {
  api.request.mockImplementation(({ path }: { path: string }) => {
    if (path === 'documents/7/versions') {
      return Promise.resolve({ data: versions });
    }
    if (path === 'documents/7') {
      return Promise.resolve({ data: detail });
    }
    if (path.startsWith('documents/7/versions/')) {
      return Promise.resolve({ data: detail });
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
}

describe('document version history overlay', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
    permission.can = true;
  });

  it('renders inside its dialog with the modifier and a restore action', async () => {
    mockDocumentVersions();
    const reload = vi.fn();
    renderAt(
      <DocumentVersionsPage />,
      '/settings/document-center/documents/7/versions',
      {
        reload,
      },
    );

    const dialog = await screen.findByRole('dialog', {
      name: enUS['documentsAdmin.versions.title'],
    });
    expect(dialog).toBeVisible();
    expect(await screen.findByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: enUS['documentsAdmin.versions.restore'],
      }),
    ).toBeInTheDocument();
  });

  it('restores a version through the confirmation and reloads the list', async () => {
    mockDocumentVersions();
    const reload = vi.fn();
    renderAt(
      <DocumentVersionsPage />,
      '/settings/document-center/documents/7/versions',
      {
        reload,
      },
    );

    const rowAction = await screen.findByRole('button', {
      name: enUS['documentsAdmin.versions.restore'],
    });
    await userEvent.click(rowAction);
    const actions = await screen.findAllByRole('button', {
      name: enUS['documentsAdmin.versions.restore'],
    });
    await userEvent.click(actions[actions.length - 1]);

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'documents/7/versions/1/restore',
          method: 'POST',
        }),
      ),
    );
    expect(reload).toHaveBeenCalled();
  });
});

describe('document preview version history', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
    permission.can = true;
  });

  it('shows the modifier and offers restore when the user may manage', async () => {
    mockDocumentVersions();
    renderAt(<DocumentPreviewPage />, '/documents/7', { reload: vi.fn() });

    const drawer = await screen.findByRole('dialog', { name: detail.title });
    expect(drawer).toBeVisible();
    expect(await screen.findByText(/Alice/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: enUS['documentsAdmin.versions.restore'],
      }),
    ).toBeInTheDocument();
  });

  it('keeps the modifier but hides restore from a reader without the permission', async () => {
    permission.can = false;
    mockDocumentVersions();
    renderAt(<DocumentPreviewPage />, '/documents/7', { reload: vi.fn() });

    expect(await screen.findByText(/Alice/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: enUS['documentsAdmin.versions.restore'],
      }),
    ).toBeNull();
    // The modifier name comes from the version endpoint, so a reader without
    // the `manage` action never triggers the administrator-only directory call
    // that used to answer 403.
    expect(api.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: 'directoryUsers' }),
    );
  });
});

describe('backup restore overlay', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  it('renders the impact inside its dialog', async () => {
    api.request.mockImplementation(({ path }: { path: string }) => {
      if (path === 'documentBackups/1/impact') {
        return Promise.resolve({ data: impact });
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });
    renderAt(
      <BackupRestorePage />,
      '/settings/document-center/backups/1/restore',
      {
        reload: vi.fn(),
      },
    );

    expect(
      await screen.findByRole('dialog', {
        name: enUS['documentsAdmin.backupRestore.title'],
      }),
    ).toBeVisible();
    expect(await screen.findByText(detail.title)).toBeInTheDocument();
  });
});
