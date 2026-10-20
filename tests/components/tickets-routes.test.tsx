import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import TicketsPage from '../../client/pages/tickets/index.js';

vi.mock('../../client/pages/tickets/shared.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../client/pages/tickets/shared.js')
  >()),
  useTicketsApi: () => ({
    data: { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
    error: undefined,
    loading: false,
    reload: vi.fn(),
  }),
  useTicketPermission: () => true,
}));

const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function renderAt(path: string): ReactElement {
  return (
    <TestI18nProvider runtime={runtime}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path='/tickets' element={<TicketsPage />}>
            <Route path='new' element={<div>new ticket form</div>} />
            <Route path=':ticketId' element={<div>ticket detail</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </TestI18nProvider>
  );
}

describe('ticket child routes', () => {
  it('renders the create page inside the ticket list route', () => {
    render(renderAt('/tickets/new'));
    expect(screen.getByText('new ticket form')).toBeVisible();
  });

  it('renders the detail page inside the ticket list route', () => {
    render(renderAt('/tickets/ticket-1'));
    expect(screen.getByText('ticket detail')).toBeVisible();
  });
});
