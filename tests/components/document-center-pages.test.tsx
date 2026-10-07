// The employee Document Center: the browse list and the question panel, rendered with the application's real locale
// files and a mocked API client, so the test fails when the copy changes or a page asks its endpoint for the wrong
// thing.
import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AskPanel } from '@/pages/documents/ask-panel';
import { DocumentBrowse } from '@/pages/documents/document-browse';

import enUS from '../../client/locales/en-US.js';

// `vi.mock` factories run before this file's imports, so the shared objects are created in `vi.hoisted`.
const { api, toaster } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  // The real module keeps `ApiClientError` the class the page checks with `instanceof`.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));

const runtime = await createTestI18nRuntime({
  application: { namespace: 'nb3-factory', resources: enUS },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

/** The page as the application routes it; both employees' views share the same route. */
function renderPage(element: ReactElement, url = '/documents') {
  const router = createMemoryRouter([{ path: '/documents', element }], {
    initialEntries: [url],
  });
  render(<RouterProvider router={router} />, { wrapper: I18n });
  return router;
}

const document = {
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
};

const forbidden = new ApiClientError('Forbidden', {
  status: 403,
  method: 'GET',
  url: '/api/documents',
});

describe('document browse', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  it('lists the documents the endpoint returns', async () => {
    api.request.mockResolvedValue({
      data: [document],
      meta: { page: 1, pageSize: 20, total: 1 },
    });
    renderPage(<DocumentBrowse />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByText(document.title)).toBeInTheDocument();
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'documents' }),
    );
  });

  it('shows the empty state when the reader may read nothing', async () => {
    api.request.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
    renderPage(<DocumentBrowse />);

    expect(
      await screen.findByText(enUS['documents.empty.title']),
    ).toBeInTheDocument();
  });

  it('describes a denied list instead of leaving it empty', async () => {
    api.request.mockRejectedValue(forbidden);
    renderPage(<DocumentBrowse />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(enUS['documents.error.forbidden']);
    expect(
      screen.getByRole('button', { name: enUS['documents.action.retry'] }),
    ).toBeInTheDocument();
  });
});

describe('document question panel', () => {
  beforeEach(() => {
    api.request.mockReset();
    toaster.show.mockReset();
  });

  it('answers with the paragraphs that support it', async () => {
    api.request.mockResolvedValue({
      data: {
        hasAnswer: true,
        citations: [
          {
            documentId: '7',
            title: document.title,
            version: 2,
            heading: '报销流程',
            snippet: '出差结束后十个工作日内，员工应在报销系统中提交报销单。',
            score: 6,
          },
        ],
      },
    });
    renderPage(<AskPanel />);

    await userEvent.type(screen.getByRole('textbox'), '出差怎么报销');
    await userEvent.click(
      screen.getByRole('button', { name: enUS['documents.ask.submit'] }),
    );

    expect(await screen.findByText(document.title)).toBeInTheDocument();
    expect(screen.getByText(/出差结束后十个工作日内/)).toBeInTheDocument();
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'documents/ask',
        method: 'POST',
        json: { question: '出差怎么报销' },
      }),
    );
  });

  it('reports when no readable document answers', async () => {
    api.request.mockResolvedValue({
      data: { hasAnswer: false, citations: [] },
    });
    renderPage(<AskPanel />);

    await userEvent.type(screen.getByRole('textbox'), '不存在的制度');
    await userEvent.click(
      screen.getByRole('button', { name: enUS['documents.ask.submit'] }),
    );

    expect(
      await screen.findByText(enUS['documents.ask.noAnswer.title']),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByText(enUS['documents.ask.citationsTitle']),
      ).toBeNull(),
    );
  });
});
