// The document library page, rendered against a stubbed API client: what the reader sees (a list and nothing that
// changes it, with the whole document readable) and what the maintainer sees (a create control and an edit per owned
// row). The server side of these rules is covered by `tests/logic/library.test.ts`.
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LibraryPage from '@/pages/library/index';

import enUS from '../../client/locales/en-US.js';

// `vi.mock` factories run before this file's imports, so the stubs live in `vi.hoisted`.
const { api, toaster } = vi.hoisted(() => ({
  // One object for the whole file: a new one per call would restart the page's load effect.
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
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

const publicDocument = {
  id: 'doc-public',
  title: 'Public handbook',
  body: 'Everyone may read this body.',
  ownerId: 'user-1',
  ownerName: 'Maintainer',
  published: true,
  confidential: false,
};

const listBody = (canCreate: boolean, editableIds: readonly string[]) => ({
  data: [publicDocument],
  meta: { total: 1, canCreate, editableIds },
});

beforeEach(() => {
  api.request.mockReset();
  toaster.show.mockReset();
});

describe('the document library page', () => {
  it('gives a reader the list and the document, and no way to change it', async () => {
    api.request.mockResolvedValue(listBody(false, []));
    render(<LibraryPage />, { wrapper: I18n });

    const title = await screen.findByRole('button', {
      name: publicDocument.title,
    });
    expect(screen.queryByRole('button', { name: /New document/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /Edit/u })).toBeNull();

    // Reading means the body is reachable, without a control that would save it.
    await userEvent.click(title);
    expect(await screen.findByText(publicDocument.body)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('gives the maintainer a create control and an edit for an owned row', async () => {
    api.request.mockResolvedValue(listBody(true, [publicDocument.id]));
    render(<LibraryPage />, { wrapper: I18n });

    expect(
      await screen.findByRole('button', { name: /New document/u }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit/u })).toBeInTheDocument();
  });

  it('posts a new document and reloads the list', async () => {
    api.request.mockImplementation((request: { method?: string }) =>
      Promise.resolve(
        request.method === 'POST'
          ? { data: publicDocument }
          : listBody(true, []),
      ),
    );
    render(<LibraryPage />, { wrapper: I18n });

    await userEvent.click(
      await screen.findByRole('button', { name: /New document/u }),
    );
    await userEvent.type(
      await screen.findByLabelText(enUS.library.field.title),
      'Onboarding guide',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'documents',
          method: 'POST',
          json: expect.objectContaining({ title: 'Onboarding guide' }),
        }),
      );
    });
    expect(toaster.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: enUS.library.saved }),
    );
    // The list is fetched again, so the new document appears without a manual reload.
    expect(api.request).toHaveBeenCalledTimes(3);
  });
});
