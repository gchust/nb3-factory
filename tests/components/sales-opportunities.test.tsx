// The opportunities page as the user meets it: the rows it puts on screen, the amount and stage it renders, the
// stage filter it keeps in the URL, and the states it shows when nothing matches or nothing exists yet.
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import OpportunitiesPage from '../../client/pages/sales/opportunities/index.js';

// The sales copy is a nested object, so it is read as one; `t`'s dotted keys resolve to these same values.
const SALES = enUS.sales;

// `vi.mock` factories run before this file's imports and code, so the client is created here.
const { api } = vi.hoisted(() => ({
  // One object for the whole file: a new one per call would restart the page's effect on every render.
  api: { request: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module; `ApiClientError` stays the class the page's failure state checks with `instanceof`.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
}));

// The real runtime, strict: a key the application's resources lack fails the test instead of rendering as text.
const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: enUS,
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

interface Opportunity {
  readonly id: string;
  readonly name: string | null;
  readonly customerId: string;
  readonly customerName: string;
  readonly amount: number | null;
  readonly stage: 'following' | 'won' | 'lost';
}

const ROWS: Opportunity[] = [
  {
    id: '1',
    name: 'Acme renewal',
    customerId: '10',
    customerName: 'Acme Corporation',
    amount: 120000,
    stage: 'following',
  },
  {
    id: '2',
    name: 'Acme expansion',
    customerId: '10',
    customerName: 'Acme Corporation',
    amount: 48000,
    stage: 'won',
  },
  {
    id: '3',
    name: null,
    customerId: '11',
    customerName: 'Globex Industries',
    amount: null,
    stage: 'lost',
  },
];

/** Answers every list request the way the endpoint does: it filters by stage, and the page asks it to. */
function respondWith(rows: readonly Opportunity[]): void {
  api.request.mockImplementation(
    (options: { query?: { stage?: string; q?: string } }) => {
      const { stage, q } = options.query ?? {};
      const data = rows
        .filter((row) => !stage || row.stage === stage)
        .filter((row) => !q || (row.name ?? '').includes(q));
      return Promise.resolve({
        data,
        meta: { total: data.length, page: 1, pageSize: 100 },
      });
    },
  );
}

/** The page at the URL the user opened, with the child routes its dialogs need. */
function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/opportunities',
        element: <OpportunitiesPage />,
        children: [
          { path: 'new', element: <p>new</p> },
          { path: 'edit/:opportunityId', element: <p>edit</p> },
        ],
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />, { wrapper: I18n });
  return router;
}

describe('opportunities page', () => {
  beforeEach(() => {
    api.request.mockReset();
  });

  it('shows each opportunity with its amount and stage, and links its customer', async () => {
    respondWith(ROWS);
    renderAt('/opportunities');

    expect(await screen.findByText('Acme renewal')).toBeInTheDocument();
    // Amounts are plain numbers with two decimals, in the current language.
    expect(screen.getByText('120,000.00')).toBeInTheDocument();
    expect(screen.getByText('48,000.00')).toBeInTheDocument();
    // A record without an amount shows an em dash rather than 0.
    expect(screen.getByText('—')).toBeInTheDocument();
    // The stage is shown, translated, for every row.
    expect(screen.getAllByText(SALES.stage.won)).toHaveLength(1);
    expect(screen.getAllByText(SALES.stage.lost)).toHaveLength(1);
    // Both of the customer's opportunities link to the same customer page.
    const customerLinks = screen.getAllByRole('link', {
      name: 'Acme Corporation',
    });
    expect(customerLinks).toHaveLength(2);
    expect(customerLinks[0]).toHaveAttribute('href', '/customers/10');
    // An opportunity with no name is still editable from its row, under its own label.
    expect(
      screen.getByRole('link', {
        name: SALES.opportunity.editNamed.replace(
          '{{name}}',
          SALES.opportunity.unnamed,
        ),
      }),
    ).toHaveAttribute('href', '/opportunities/edit/3');

    // The first request asks for the whole first page, with no filters.
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'opportunities',
        query: { pageSize: 100 },
      }),
    );
  });

  it('reads the stage filter from the URL and asks the server for it', async () => {
    respondWith(ROWS);
    renderAt('/opportunities?stage=won');

    expect(await screen.findByText('Acme expansion')).toBeInTheDocument();
    expect(screen.queryByText('Acme renewal')).not.toBeInTheDocument();
    expect(api.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: 'opportunities',
        query: { stage: 'won', pageSize: 100 },
      }),
    );
  });

  it('writes a chosen stage into the URL, so the filtered list can be linked', async () => {
    respondWith(ROWS);
    const router = renderAt('/opportunities');

    expect(await screen.findByText('Acme renewal')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('combobox', { name: SALES.filters.stage }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: SALES.stage.lost }),
    );

    await waitFor(() =>
      expect(router.state.location.search).toBe('?stage=lost'),
    );
    // The filter is not applied locally: the page asks the endpoint for the filtered page.
    await waitFor(() =>
      expect(api.request).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: { stage: 'lost', pageSize: 100 } }),
      ),
    );
    expect(screen.queryByText('Acme renewal')).not.toBeInTheDocument();
  });

  it('offers a way out when a filter matches nothing', async () => {
    respondWith([]);
    const router = renderAt('/opportunities?stage=won');

    expect(await screen.findByText(SALES.empty.noResults)).toBeInTheDocument();
    // Both the filter bar and the empty message offer the same way out of a filter.
    const clearButtons = screen.getAllByRole('button', {
      name: SALES.filters.clear,
    });
    expect(clearButtons).toHaveLength(2);
    await userEvent.click(clearButtons[1]);

    // Clearing removes the filter from the URL as well, and asks for the unfiltered list again.
    await waitFor(() => expect(router.state.location.search).toBe(''));
    await waitFor(() =>
      expect(api.request).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: { pageSize: 100 } }),
      ),
    );
  });

  it('invites the user to create the first opportunity when there are none', async () => {
    respondWith([]);
    renderAt('/opportunities');

    expect(
      await screen.findByText(SALES.opportunity.empty.title),
    ).toBeInTheDocument();
    const createLinks = screen.getAllByRole('button', {
      name: SALES.opportunity.create,
    });
    // The page's own action and the empty state's both lead to the form.
    expect(createLinks).toHaveLength(2);
    for (const link of createLinks) {
      expect(link).toHaveAttribute('href', '/opportunities/new');
    }
  });
});
