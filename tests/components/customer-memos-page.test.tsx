import type { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider, NamespaceScope } from '@nocobase/i18n/client';
import {
  apiClientToken,
  ClientApplicationContext,
  createAppI18nRuntime,
  type ApiClient,
  type ApiRequestOptions,
  type ClientApplication,
} from '@nocobase/app-client';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.ts';
import CustomerMemosPage from '../../client/pages/memos/index.tsx';
import type { CustomerMemo } from '../../client/pages/memos/types.ts';

const APPLICATION_NAMESPACE = 'nb3-factory';

const beijing: CustomerMemo = {
  id: 1,
  customerName: '北京华信科技有限公司',
  content: '已确认续约意向',
  createdAt: '2026-09-10T01:30:00.000Z',
};

const shanghai: CustomerMemo = {
  id: 2,
  customerName: '上海远景贸易有限公司',
  content: null,
  createdAt: '2026-09-12T02:00:00.000Z',
};

let runtime: I18nRuntime;
let memos: CustomerMemo[];
let nextId: number;

beforeEach(async () => {
  runtime = await createAppI18nRuntime({
    defaultLocale: 'en-US',
    initialLocale: 'en-US',
    locales: ['en-US'],
    contributions: [
      {
        packageName: APPLICATION_NAMESPACE,
        source: 'application',
        locales: { 'en-US': async () => enUS },
      },
    ],
  });
  memos = [];
  nextId = 1;
});

function createApiClient() {
  const request = vi.fn<(options: ApiRequestOptions) => Promise<unknown>>(
    async (options) => {
      const method = options.method ?? 'GET';

      if (method === 'GET') {
        const search = String(options.query?.search ?? '').trim();
        return {
          data: search
            ? memos.filter((memo) => memo.customerName.includes(search))
            : [...memos],
        };
      }

      if (method === 'POST') {
        const values = options.json as {
          customerName: string;
          content?: string | null;
        };
        const created: CustomerMemo = {
          id: nextId++,
          customerName: values.customerName,
          content: values.content ? values.content : null,
          createdAt: '2026-09-23T08:00:00.000Z',
        };
        memos = [...memos, created];
        return { data: created };
      }

      if (method === 'PATCH') {
        const id = Number(String(options.path).split('/')[1]);
        const values = options.json as {
          customerName: string;
          content?: string | null;
        };
        const updated: CustomerMemo = {
          id,
          customerName: values.customerName,
          content: values.content ? values.content : null,
          createdAt: beijing.createdAt,
        };
        memos = memos.map((memo) => (memo.id === id ? updated : memo));
        return { data: updated };
      }

      if (method === 'DELETE') {
        const id = Number(String(options.path).split('/')[1]);
        memos = memos.filter((memo) => memo.id !== id);
        return undefined;
      }

      throw new Error(`Unhandled request: ${method} ${String(options.path)}`);
    },
  );

  return { request, client: { request } as unknown as ApiClient };
}

function renderPage(client: ApiClient) {
  const app = {
    services: {
      resolve: (token: unknown) => {
        if (token === apiClientToken) {
          return client;
        }
        throw new Error(`Unexpected service token: ${String(token)}`);
      },
    },
  } as unknown as ClientApplication;

  render(
    <ClientApplicationContext.Provider value={app}>
      <I18nProvider runtime={runtime}>
        <NamespaceScope ns={APPLICATION_NAMESPACE}>
          <CustomerMemosPage />
        </NamespaceScope>
      </I18nProvider>
    </ClientApplicationContext.Provider>,
  );
}

function callsTo(
  request: ReturnType<typeof createApiClient>['request'],
  method: string,
) {
  return request.mock.calls
    .map(([options]) => options)
    .filter((options) => (options.method ?? 'GET') === method);
}

describe('customer memos page', () => {
  it('lists the memos returned by the API', async () => {
    memos = [beijing, shanghai];
    const { client } = createApiClient();
    renderPage(client);

    expect(await screen.findByText(beijing.customerName)).toBeVisible();
    expect(screen.getByText(shanghai.customerName)).toBeVisible();
    expect(screen.getByText('已确认续约意向')).toBeVisible();
  });

  it('blocks saving a memo without a customer name', async () => {
    const { client, request } = createApiClient();
    renderPage(client);
    const user = userEvent.setup();

    await screen.findByText(
      'No memos yet. Add your first memo to get started.',
    );
    await user.click(screen.getByRole('button', { name: 'Add memo' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Customer name is required.',
    );
    expect(callsTo(request, 'POST')).toHaveLength(0);
  });

  it('creates a memo and shows it in the list', async () => {
    const { client, request } = createApiClient();
    renderPage(client);
    const user = userEvent.setup();

    await screen.findByText(
      'No memos yet. Add your first memo to get started.',
    );
    await user.click(screen.getByRole('button', { name: 'Add memo' }));
    await user.type(screen.getByLabelText('Customer name'), '广州星辰软件');
    await user.type(screen.getByLabelText('Memo'), '需要跟进');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('广州星辰软件')).toBeVisible();
    const posts = callsTo(request, 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].json).toEqual({
      customerName: '广州星辰软件',
      content: '需要跟进',
    });
  });

  it('searches by a partial customer name and restores the list when cleared', async () => {
    memos = [beijing, shanghai];
    const { client, request } = createApiClient();
    renderPage(client);
    const user = userEvent.setup();

    await screen.findByText(shanghai.customerName);
    const search = screen.getByLabelText('Search by customer name');
    await user.type(search, '华信');

    await waitFor(() =>
      expect(screen.queryByText(shanghai.customerName)).not.toBeInTheDocument(),
    );
    expect(screen.getByText(beijing.customerName)).toBeVisible();
    expect(
      callsTo(request, 'GET').some(
        (options) => options.query?.search === '华信',
      ),
    ).toBe(true);

    await user.clear(search);
    await waitFor(() =>
      expect(screen.getByText(shanghai.customerName)).toBeVisible(),
    );
    expect(screen.getByText(beijing.customerName)).toBeVisible();
  });

  it('deletes a memo only after a second confirmation', async () => {
    memos = [beijing];
    const { client, request } = createApiClient();
    renderPage(client);
    const user = userEvent.setup();

    await screen.findByText(beijing.customerName);
    const deleteLabel = `Delete memo for ${beijing.customerName}`;

    await user.click(screen.getByRole('button', { name: deleteLabel }));
    const cancelDialog = await screen.findByRole('dialog');
    expect(within(cancelDialog).getByText('Delete memo')).toBeVisible();

    await user.click(
      within(cancelDialog).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(screen.getByText(beijing.customerName)).toBeVisible();
    expect(callsTo(request, 'DELETE')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: deleteLabel }));
    const confirmDialog = await screen.findByRole('dialog');
    await user.click(
      within(confirmDialog).getByRole('button', { name: 'Confirm' }),
    );

    await waitFor(() =>
      expect(screen.queryByText(beijing.customerName)).not.toBeInTheDocument(),
    );
    expect(callsTo(request, 'DELETE')).toHaveLength(1);
  });
});
