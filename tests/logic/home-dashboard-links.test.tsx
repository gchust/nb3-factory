import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

/**
 * The dashboard navigates to the application's own pages. Renaming the page
 * routes (`contracts` to `projects`, `receivables` to `settlements`) left the
 * dashboard pointing at routes that no longer exist, so a click silently fell
 * back to the empty landing page. The dashboard also has to surface the open
 * issue count, which is the module this system adds on top of acceptance.
 */
const state = vi.hoisted(() => ({
  apiClient: {
    request: vi.fn(async (options: { path: string }) => {
      if (options.path === 'delivery/dashboard') {
        return {
          data: {
            cards: {
              pendingReview: 1,
              overdueMilestones: 2,
              activeContracts: 3,
              outstandingCents: 4_000,
              acceptedMilestones: 5,
              totalMilestones: 8,
              openIssues: 6,
            },
            pendingReview: [],
            overdueMilestones: [],
            recentIssues: [],
            contracts: [],
          },
        };
      }
      throw new Error(`Unexpected request: ${options.path}`);
    }),
  },
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => state.apiClient,
}));

const { default: HomePage } = await import('../../client/pages/home.js');

describe('home dashboard navigation', () => {
  it('links to the current page routes and never to a removed one', async () => {
    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    await screen.findByText('delivery.dashboard.openIssues');

    const hrefs = [...container.querySelectorAll('a')].map((anchor) =>
      anchor.getAttribute('href'),
    );
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/projects',
        '/settlements',
        '/issues',
        '/acceptance',
      ]),
    );
    expect(hrefs.some((href) => href?.includes('contracts'))).toBe(false);
    expect(hrefs.some((href) => href?.includes('receivables'))).toBe(false);

    const openIssues = screen.getByText('6');
    expect(openIssues).toBeTruthy();
  });
});
