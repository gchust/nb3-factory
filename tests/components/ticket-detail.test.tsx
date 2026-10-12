import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';
import type {
  Ticket,
  TicketDetail,
  TicketsOutletContext,
} from '../../client/pages/tickets/types.js';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  const client = { request: mocks.request };
  return { ...actual, useApiClient: () => client };
});

import TicketDetailPage from '../../client/pages/tickets/detail/index.js';

const ticket: Ticket = {
  id: 't-1',
  title: 'Laptop will not turn on',
  description: 'The machine is dead.',
  category: 'hardware',
  priority: 'low',
  status: 'submitted',
  statusChangedAt: '2026-10-01T08:00:00.000Z',
  reporterId: 'u-alice',
  reporterName: 'Alice',
  assigneeId: null,
  assigneeName: null,
  resolution: null,
  serviceDeskNote: null,
  reopenReason: null,
  reopenedCount: 0,
  screenshotIds: null,
  resolvedAt: null,
  closedAt: null,
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
};

const detail: TicketDetail = {
  ticket,
  available: [
    { name: 'assign', title: 'Assign ticket', allowed: true, blockers: [] },
    { name: 'start', title: 'Start work', allowed: true, blockers: [] },
  ],
  comments: [],
  attachments: [],
};

let runtime: I18nRuntime;
let reload: ReturnType<typeof vi.fn<() => void>>;

beforeEach(async () => {
  mocks.request.mockReset();
  mocks.request.mockImplementation(
    async ({ path, method }: { path: string; method?: string }) => {
      if (path === 'helpdesk/engineers') {
        return {
          data: [
            { id: 'u-bob', name: 'Bob Li', email: 'bob@example.com' },
            { id: 'u-carol', name: 'Carol Wang', email: 'carol@example.com' },
          ],
        };
      }
      if (method === 'POST') return { data: ticket };
      return { data: detail };
    },
  );
  reload = vi.fn<() => void>();
  runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'test-app',
  });
  runtime.registerApplicationNamespace('test-app', locales);
  await runtime.init('en-US');
});

function Frame(): ReactElement {
  const context: TicketsOutletContext = { reload };
  return (
    <MemoryRouter initialEntries={['/tickets/t-1']}>
      <I18nProvider runtime={runtime}>
        <Routes>
          <Route path='/tickets' element={<Outlet context={context} />}>
            <Route path=':id' element={<TicketDetailPage />} />
          </Route>
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
}

describe('ticket detail transitions', () => {
  it('opens the assign dialog with the ticket’s current priority and category', async () => {
    render(<Frame />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Assign ticket' }),
    );

    const dialog = within(await screen.findByRole('dialog'));
    // The dialog starts from the ticket, so confirming without a change keeps Low and hardware. The trigger's own
    // `Low` is the only one inside the dialog; the page header badge is outside it.
    expect(dialog.getByText('Low')).toBeVisible();
    expect(dialog.queryByText('Medium')).not.toBeInTheDocument();
    expect(dialog.getByLabelText('Category')).toHaveValue('hardware');
  });

  it('shows the chosen engineer by name rather than by internal id', async () => {
    render(<Frame />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Assign ticket' }),
    );
    const dialog = within(await screen.findByRole('dialog'));

    fireEvent.click(dialog.getByLabelText('Assignee'));
    fireEvent.click(await screen.findByRole('option', { name: 'Bob Li' }));

    await waitFor(() => expect(dialog.getByText('Bob Li')).toBeVisible());
    expect(dialog.queryByText('u-bob')).not.toBeInTheDocument();
  });

  it('refreshes both the detail and the list it opened over after a transition', async () => {
    render(<Frame />);

    fireEvent.click(await screen.findByRole('button', { name: 'Start work' }));

    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith({
        path: 'tickets/t-1/fire',
        method: 'POST',
        json: { transition: 'start', input: {} },
      }),
    );
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });
});
