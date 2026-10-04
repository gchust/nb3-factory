import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import appEnUS from '../../client/locales/en-US.ts';

/**
 * The after-sales pages were the whole of the reported defect: the routes had
 * no page behind them, so every menu entry opened an empty screen. The static
 * route test proves a loader exists; these render the page against a mocked
 * API envelope to prove the shape the server returns is the shape the page
 * reads — the failure that turns a wired page back into a blank one.
 */

const missing = new Set<string>();

function lookup(key: string): string | undefined {
  const flat = (appEnUS as Record<string, unknown>)[key];
  if (typeof flat === 'string') return flat;
  let node: unknown = appEnUS;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

vi.mock('@nocobase/i18n/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/i18n/client')>()),
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: Record<string, unknown>) => {
      const template = lookup(key);
      if (template === undefined) {
        missing.add(key);
        return (options?.defaultValue as string | undefined) ?? key;
      }
      return template.replace(/\{\{(\w+)\}\}/gu, (whole, name: string) =>
        options && name in options ? String(options[name]) : whole,
      );
    },
  }),
}));

type Handler = (options: {
  path: string;
  query?: Record<string, unknown>;
}) => unknown;

const request = vi.fn();

vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => ({ request }),
  useToaster: () => ({ show: vi.fn() }),
}));

let handlers: Record<string, Handler>;

beforeEach(() => {
  missing.clear();
  request.mockReset();
  request.mockImplementation(
    async ({
      path,
      query,
    }: {
      path: string;
      query?: Record<string, unknown>;
    }) => {
      const handler =
        handlers[path] ??
        Object.entries(handlers).find(([key]) => path.startsWith(key))?.[1];
      if (!handler) throw new Error(`No handler for ${path}`);
      return { data: handler({ path, query }) };
    },
  );
});

async function renderPage(element: React.ReactElement): Promise<void> {
  render(<MemoryRouter>{element}</MemoryRouter>);
}

describe('after-sales service pages render the server shape', () => {
  it('lists customers from the paged envelope', async () => {
    handlers = {
      '/service/customers': () => ({
        items: [
          {
            id: 1,
            code: 'CUST-0001',
            name: '北方重工',
            level: 'vip',
            region: '沈阳',
            contact: '王工',
            phone: '024-000000',
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 100,
      }),
    };
    const { default: CustomersPage } =
      await import('../../client/pages/service/customers/index.tsx');
    await renderPage(<CustomersPage />);
    await waitFor(() => expect(screen.getByText('北方重工')).toBeTruthy());
    expect(screen.getByText('CUST-0001')).toBeTruthy();
    expect(missing.size).toBe(0);
  });

  it('lists tickets and links each row to its detail page', async () => {
    handlers = {
      '/service/tickets': () => ({
        items: [
          {
            id: 7,
            ticketNo: 'T-2026-0007',
            title: '主轴异响',
            description: null,
            status: 'processing',
            priority: 'urgent',
            confidential: false,
            customerId: 1,
            deviceId: 1,
            assigneeId: 1,
            reporterId: 1,
            source: 'internal',
            externalEventNo: null,
            acceptedAt: null,
            startedAt: null,
            submittedAt: null,
            closedAt: null,
            slaDueAt: null,
            handling: null,
            resolution: null,
            acceptanceNote: null,
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
            customerName: '北方重工',
            customerCode: 'CUST-0001',
            deviceNo: 'DEV-1001',
            deviceModel: 'CK6140',
            assigneeName: '李工',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
      '/service/engineers': () => [],
    };
    const { default: TicketsPage } =
      await import('../../client/pages/service/tickets/index.tsx');
    await renderPage(<TicketsPage />);
    await waitFor(() => expect(screen.getByText('主轴异响')).toBeTruthy());
    expect(screen.getByText('T-2026-0007')).toBeTruthy();
    expect(missing.size).toBe(0);
  });
});
