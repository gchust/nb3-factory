// The QA defects for the ticket pages are display defects: a ticket's customer
// and device were never shown, and the owner was rendered as a raw id. The
// server resolves those names now; these tests render the real pages against a
// mocked API and assert the resolved names reach the screen.
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TicketsPage from '@/pages/service/tickets/index.js';
import TicketDetailPage from '@/pages/service/tickets/detail.js';
import type { Ticket, TicketDetail } from '@/pages/service/types.js';

import enUS from '../../client/locales/en-US.js';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real classes and helpers; only the request function is replaced.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => ({ request: apiRequest }),
  useToaster: () => ({ show: vi.fn(), close: vi.fn() }),
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

const supervisor = {
  id: 'user-supervisor',
  name: 'Wu Supervisor',
  permissionSets: ['service-supervisor'],
  supervisor: true,
};

const ticket: Ticket = {
  id: 7,
  ticketNo: 'SR-20261009-0007',
  title: 'Lathe turret fails to index',
  customerId: 1,
  deviceId: 2,
  customerName: 'Shanghai Jingmi Precision',
  deviceSerial: 'JMP-CNC-002',
  deviceName: 'CNC Lathe',
  ownerName: 'Li Engineer A',
  problem: 'Turret stops between stations.',
  priority: 'normal',
  dueAt: null,
  ownerId: 'user-engineer-a',
  confidential: false,
  status: 'pending',
  result: null,
  resolutionNote: null,
  rejectReason: null,
  acceptedAt: null,
  closedAt: null,
  externalEventNo: null,
  source: 'manual',
  createdById: 'user-supervisor',
  observerVisible: true,
  assistantDraft: null,
  createdAt: '2026-10-09T02:00:00.000Z',
  updatedAt: '2026-10-09T02:00:00.000Z',
};

const detail: TicketDetail = {
  ticket,
  logs: [],
  shares: [],
  attachments: [],
  access: 'full',
};

/** Routes each path to the record the page under test needs. */
function respond({ path }: { readonly path: string }): Promise<unknown> {
  if (path === 'service/me') return Promise.resolve({ data: supervisor });
  if (path === 'service/tickets') {
    return Promise.resolve({ data: { items: [ticket], total: 1 } });
  }
  if (path === 'service/tickets/7') return Promise.resolve({ data: detail });
  if (path === 'service/devices') return Promise.resolve({ data: [] });
  if (path === 'service/customers') return Promise.resolve({ data: [] });
  if (path === 'service/engineers') return Promise.resolve({ data: [] });
  return Promise.resolve({ data: null });
}

function renderAt(routePath: string, url: string, element: ReactElement): void {
  const router = createMemoryRouter([{ path: routePath, element }], {
    initialEntries: [url],
  });
  render(<RouterProvider router={router} />, { wrapper: I18n });
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(respond);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ticket pages show the ticket customer and device', () => {
  it('renders the customer and device names in the ticket list', async () => {
    renderAt('/service/tickets', '/service/tickets', <TicketsPage />);

    await waitFor(() =>
      expect(screen.getByText(ticket.ticketNo)).toBeInTheDocument(),
    );
    expect(screen.getByText('Shanghai Jingmi Precision')).toBeInTheDocument();
    expect(screen.getByText('JMP-CNC-002 · CNC Lathe')).toBeInTheDocument();
  });

  it('renders the customer, device and owner name on the ticket detail', async () => {
    renderAt(
      '/service/tickets/:ticketId',
      '/service/tickets/7',
      <TicketDetailPage />,
    );

    await waitFor(() =>
      expect(screen.getByText(ticket.ticketNo)).toBeInTheDocument(),
    );
    expect(screen.getByText('Shanghai Jingmi Precision')).toBeInTheDocument();
    expect(screen.getByText('JMP-CNC-002 · CNC Lathe')).toBeInTheDocument();
    // The owner is a name, not the raw id that used to be shown.
    expect(screen.getByText('Li Engineer A')).toBeInTheDocument();
    expect(screen.queryByText('user-engineer-a')).not.toBeInTheDocument();
  });
});
