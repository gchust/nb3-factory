// The document library's pages, driven through the real components with the API client mocked.
//
// The server decides what a caller may do, so these tests are about what the pages do with that decision: a reader's
// list offers no way to create and no way to edit, the detail page refuses the edit route rather than rendering a form
// whose Save the server would refuse, a document outside the caller's scope reads as "not available", and the
// temporary-share panel appears only where the server said `canShare`. The endpoints themselves are covered end to end
// against a real application and database in `tests/logic/library-api.test.ts`.
import { ApiClientError } from '@nocobase/app-client';
import type {
  ManagedUser,
  UsersOptions,
} from '@nocobase/app-plugin-users/client/user-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import DocumentDetailPage from '../../client/pages/library/detail/index.js';
import EditDocumentPage from '../../client/pages/library/detail/edit.js';
import LibraryPage from '../../client/pages/library/index.js';
import NewDocumentPage from '../../client/pages/library/new.js';
import MembersPage from '../../client/pages/members/index.js';
import type {
  LibraryDocument,
  LibraryShare,
} from '../../client/pages/library/types.js';

const { api, toaster } = vi.hoisted(() => ({
  // One object for the whole file, so every page under test shares the same mock and requests are asserted on it.
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module, so `ApiClientError` stays the class the pages branch on with `instanceof`.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));

// Strict: a key the locale lacks fails the test instead of rendering as its own name.
const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

const JIA = 'a1000000-0000-4000-8000-000000000001';
const DUZHE = 'b2000000-0000-4000-8000-000000000002';

function libraryDocument(
  overrides: Partial<LibraryDocument> & Pick<LibraryDocument, 'id' | 'title'>,
): LibraryDocument {
  return {
    body: `${overrides.title} 的正文`,
    ownerId: JIA,
    ownerName: 'Librarian Jia',
    published: true,
    confidential: false,
    editable: false,
    canShare: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T08:30:00.000Z',
    ...overrides,
  };
}

function person(
  id: string,
  name: string,
  disabledAt: string | null = null,
): ManagedUser {
  return {
    id,
    name,
    username: id === DUZHE ? 'duzhe' : 'jia',
    email: `${id.slice(0, 4)}@example.com`,
    emailVerified: true,
    disabledAt,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    roleScopes: {
      app: id === DUZHE ? ['library.reader'] : ['library.maintainer'],
    },
  };
}

const STAFF_OPTIONS: UsersOptions = {
  roleScopes: [
    {
      key: 'app',
      label: 'Permission sets',
      selection: 'multiple',
      requiredOnCreate: false,
      options: [
        { value: 'library.maintainer', label: 'Document maintainer' },
        { value: 'library.reader', label: 'Document reader' },
      ],
    },
  ],
};

interface RequestOptions {
  readonly path: string;
  readonly method?: string;
  readonly query?: Record<string, unknown>;
  readonly json?: unknown;
}

interface Stub {
  readonly documents?: readonly LibraryDocument[];
  readonly canCreate?: boolean;
  /** Documents a direct read answers with; an id absent here is out of the caller's scope. */
  readonly byId?: Readonly<Record<string, LibraryDocument>>;
  readonly shares?: readonly LibraryShare[];
  readonly people?: readonly ManagedUser[];
}

/**
 * A whole API, asserting on every path a page may reach. An unexpected request fails the test rather than answering
 * `undefined`, so a page that started calling something new is caught here.
 */
function stub(stub: Stub): (options: RequestOptions) => unknown {
  const documents = stub.documents ?? [];
  const people = stub.people ?? [];
  return ({ path: rawPath, method }) => {
    // The application's own client prefixes its paths with `/api`'s slash; the Users client does not.
    const path = rawPath.replace(/^\//u, '');
    if (path === 'library/documents' && method === undefined) {
      return {
        data: documents,
        meta: { total: documents.length, canCreate: stub.canCreate ?? false },
      };
    }
    if (path === 'library/documents' && method === 'POST') {
      // The endpoint answers with the document it created; the page then reloads the list and closes the dialog.
      return {
        data: documents[0] ?? libraryDocument({ id: 'new', title: '新资料' }),
      };
    }
    const match = /^library\/documents\/([^/]+)$/u.exec(path);
    if (match && method === undefined) {
      const found = stub.byId?.[decodeURIComponent(match[1]!)];
      if (!found) {
        // How the endpoint presents a document outside the caller's scope, which is also a revoked share.
        throw new ApiClientError('not available', {
          status: 404,
          method: 'GET',
          url: path,
        });
      }
      return { data: found };
    }
    if (
      /^library\/documents\/[^/]+\/shares$/u.test(path) &&
      method === undefined
    ) {
      return { data: stub.shares ?? [] };
    }
    if (path === 'users' && method === undefined) {
      return {
        data: people,
        meta: { total: people.length, page: 1, pageSize: 100 },
      };
    }
    if (path === 'users/options') {
      return { data: STAFF_OPTIONS };
    }
    if (/^users\/[^/]+\/(?:disable|enable)$/u.test(path) && method === 'POST') {
      return { data: people[0] };
    }
    throw new Error(`unexpected request ${method ?? 'GET'} ${path}`);
  };
}

/** The library's route tree as `client/routes.ts` declares it: the detail and its edit dialog under the list. */
function renderLibrary(url: string, stub_: Stub) {
  api.request.mockReset();
  const handler = stub(stub_);
  api.request.mockImplementation(async (options: RequestOptions) =>
    handler(options),
  );
  const router = createMemoryRouter(
    [
      {
        path: '/library',
        element: <LibraryPage />,
        children: [
          { path: 'new', element: <NewDocumentPage /> },
          {
            path: ':id',
            element: <DocumentDetailPage />,
            children: [{ path: 'edit', element: <EditDocumentPage /> }],
          },
        ],
      },
    ],
    { initialEntries: [url] },
  );
  return render(<RouterProvider router={router} />, { wrapper: I18n });
}

describe('document library pages', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  it('lists only what the server sent, with no create action for a reader', async () => {
    const public_ = libraryDocument({ id: 'p1', title: '员工手册（公开）' });
    renderLibrary('/library', { documents: [public_], canCreate: false });

    expect(
      screen.getByRole('heading', { level: 1, name: enUS.library.title }),
    ).toBeInTheDocument();
    expect(await screen.findByText(public_.title)).toBeVisible();
    expect(screen.getByText('1 document(s)')).toBeVisible();
    // The reader holds `view` only: the endpoint would answer 403, so the action is never offered.
    expect(
      screen.queryByRole('button', { name: enUS.library.create.action }),
    ).not.toBeInTheDocument();
  });

  it('offers a maintainer the create action and only the rows the server allows to edit', async () => {
    const published = libraryDocument({ id: 'p1', title: '员工手册（公开）' });
    const draft = libraryDocument({
      id: 'd1',
      title: '2026 年度计划（草稿）',
      published: false,
      editable: true,
    });
    const confidential = libraryDocument({
      id: 'c1',
      title: '高管薪酬方案（保密）',
      confidential: true,
      editable: true,
    });
    renderLibrary('/library', {
      documents: [published, draft, confidential],
      canCreate: true,
    });

    expect(
      await screen.findByRole('button', { name: enUS.library.create.action }),
    ).toBeVisible();

    const user = userEvent.setup();
    // Base UI's menu opens on pointerdown, which jsdom's click does not dispatch; focusing and pressing
    // Down opens it the same way a keyboard user would.
    const openRowMenu = async (title: string) => {
      const trigger = screen.getByRole('button', {
        name: enUS.library.row.actions.replace('{{title}}', title),
      });
      trigger.focus();
      await user.keyboard('{ArrowDown}');
    };

    // A row the server said is not editable offers View alone.
    await openRowMenu(published.title);
    expect(
      await screen.findByRole('menuitem', { name: enUS.library.row.view }),
    ).toBeVisible();
    expect(
      screen.queryByRole('menuitem', { name: enUS.library.row.edit }),
    ).not.toBeInTheDocument();

    // Closing it before opening another, the way clicking elsewhere would.
    await user.keyboard('{Escape}');

    // A row the server said is editable offers both.
    await openRowMenu(draft.title);
    expect(
      await screen.findByRole('menuitem', { name: enUS.library.row.edit }),
    ).toBeVisible();
  });

  it('creates a private draft through the dialog and closes it', async () => {
    renderLibrary('/library', { documents: [], canCreate: true });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: enUS.library.create.action }),
    );
    const dialog = await screen.findByRole('dialog');
    // The label carries the required marker, so match the wording rather than the whole label.
    await user.type(
      within(dialog).getByRole('textbox', {
        name: new RegExp(`^${enUS.library.form.title}`),
      }),
      '新资料',
    );
    await user.click(
      within(dialog).getByRole('button', { name: enUS.actions.create }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/library/documents',
          method: 'POST',
          json: {
            title: '新资料',
            body: '',
            // Both flags default off, so a title and a body alone make a draft only its owner can see.
            published: false,
            confidential: false,
          },
        }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('lets a reader read a document and offers no way to edit it', async () => {
    const public_ = libraryDocument({ id: 'p1', title: '员工手册（公开）' });
    renderLibrary('/library/p1', {
      documents: [public_],
      byId: { p1: public_ },
    });

    expect(await screen.findByText(public_.body)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: enUS.library.edit.action }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(enUS.library.shares.title),
    ).not.toBeInTheDocument();
  });

  it('refuses the edit route for a reader instead of rendering a form', async () => {
    const public_ = libraryDocument({ id: 'p1', title: '员工手册（公开）' });
    renderLibrary('/library/p1/edit', {
      documents: [public_],
      byId: { p1: public_ },
    });

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(enUS.library.edit.forbidden)).toBeVisible();
    // No form, and no footer whose Save the endpoint would refuse with 403.
    expect(
      within(dialog).queryByRole('textbox', {
        name: new RegExp(`^${enUS.library.form.title}`),
      }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: enUS.actions.save }),
    ).not.toBeInTheDocument();
  });

  it('opens the edit dialog with the current document for an owner', async () => {
    const draft = libraryDocument({
      id: 'd1',
      title: '2026 年度计划（草稿）',
      published: false,
      editable: true,
      body: '（草稿，尚未定稿）',
    });
    renderLibrary('/library/d1/edit', {
      documents: [draft],
      byId: { d1: draft },
    });

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(enUS.library.edit.title),
    ).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue(draft.body)).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: enUS.actions.save }),
    ).toBeVisible();
  });

  it('reads a document outside the caller scope as not available', async () => {
    const public_ = libraryDocument({ id: 'p1', title: '员工手册（公开）' });
    // No `byId` entry: the endpoint answers 404, which is also how a revoked share presents itself.
    renderLibrary('/library/d1', { documents: [public_] });

    expect(await screen.findByText(enUS.library.detail.notFound)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: enUS.library.edit.action }),
    ).not.toBeInTheDocument();
  });

  it('shows the temporary-share panel only where the server said canShare', async () => {
    const draft = libraryDocument({
      id: 'd1',
      title: '2026 年度计划（草稿）',
      published: false,
      canShare: true,
    });
    const share: LibraryShare = {
      key: 'library.share.d1.b2',
      documentIds: ['d1'],
      subjectIds: [DUZHE],
      reason: null,
    };
    renderLibrary('/library/d1', {
      documents: [draft],
      byId: { d1: draft },
      shares: [share],
      people: [person(JIA, 'Librarian Jia'), person(DUZHE, 'Reader Yi')],
    });

    expect(await screen.findByText(enUS.library.shares.title)).toBeVisible();
    // A share naming 乙 is listed by the colleague's name, with the way to revoke it. The names arrive after the
    // shares, so the row shows the raw id for a moment.
    await waitFor(() =>
      expect(screen.getAllByText('Reader Yi').length).toBeGreaterThan(0),
    );
    expect(
      screen.getByRole('button', { name: enUS.library.shares.revoke }),
    ).toBeVisible();
  });
});

describe('staff page', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  function renderStaff(url = '/members') {
    api.request.mockReset();
    const handler = stub({
      people: [person(JIA, 'Librarian Jia'), person(DUZHE, 'Reader Yi')],
    });
    api.request.mockImplementation(async (options: RequestOptions) =>
      handler(options),
    );
    const router = createMemoryRouter(
      [{ path: '/members', element: <MembersPage /> }],
      { initialEntries: [url] },
    );
    return render(<RouterProvider router={router} />, { wrapper: I18n });
  }

  it('lists every account with the permission sets it holds', async () => {
    renderStaff();

    expect(
      screen.getByRole('heading', { level: 1, name: enUS.members.title }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Librarian Jia')).toBeVisible();
    expect(screen.getByText('Reader Yi')).toBeVisible();
    expect(screen.getByText('Document maintainer')).toBeVisible();
    expect(screen.getByText('Document reader')).toBeVisible();
    expect(screen.getByText('2 account(s)')).toBeVisible();
  });

  it('opens the permission sets submenu from the row actions menu', async () => {
    // `DropdownMenuLabel` is a Base UI `Menu.GroupLabel`: rendering it outside a
    // `DropdownMenuGroup` throws and takes the whole page down. Opening the submenu is
    // what mounts it, so this guards the regression.
    renderStaff();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', {
        name: enUS.members.row.actions.replace('{{name}}', 'Reader Yi'),
      }),
    );
    await user.click(
      await screen.findByRole('menuitem', {
        name: enUS.members.row.permissionSets,
      }),
    );

    expect(
      await screen.findByText(enUS.members.row.permissionSetsHint),
    ).toBeVisible();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Document reader' }),
    ).toBeChecked();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Document maintainer' }),
    ).not.toBeChecked();
  });

  it('deactivates an account through the Users endpoint and refreshes', async () => {
    renderStaff();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', {
        name: enUS.members.row.actions.replace('{{name}}', 'Reader Yi'),
      }),
    );
    await user.click(
      await screen.findByRole('menuitem', {
        name: enUS.members.row.disable,
      }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `users/${DUZHE}/disable`,
          method: 'POST',
        }),
      ),
    );
    await waitFor(() =>
      expect(toaster.show).toHaveBeenCalledWith(
        expect.objectContaining({ title: enUS.members.saved }),
      ),
    );
  });
});
