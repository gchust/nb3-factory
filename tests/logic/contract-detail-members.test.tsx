import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The member and acceptance-specialist selectors are fed by the user directory.
 * The directory request only makes sense once the contract detail says the
 * viewer may manage members, and the detail arrives after the first render, so
 * a resource that is not refetched when that flag flips leaves both selectors
 * permanently empty. This asserts the request actually happens.
 */
const state = vi.hoisted(() => {
  const requests: string[] = [];
  const apiClient = {
    request: vi.fn(async (options: { path: string }) => {
      requests.push(options.path);
      if (options.path === 'delivery/contracts/7') {
        return { data: { ...detail, ...flags } };
      }
      if (options.path === 'delivery/users') {
        return {
          data: [
            { id: 'user-2', name: 'Acceptance Specialist', username: 'acc' },
          ],
        };
      }
      throw new Error(`Unexpected request: ${options.path}`);
    }),
  };
  const flags = { canManage: true, canManageMembers: true };
  const detail = {
    contract: {
      id: 7,
      contractNo: 'CD-2026-007',
      title: 'Member scoped contract',
      customerId: 3,
      amountCents: 100_000,
      currency: 'CNY',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      managerId: 'user-1',
      status: 'active',
      note: null,
    },
    customer: { id: 3, name: 'Customer', code: 'C003' },
    contacts: [],
    managerName: 'Lead',
    members: [],
    changes: [],
    milestones: [],
    files: [],
    progress: {
      milestoneCount: 0,
      acceptedMilestoneCount: 0,
      allocatedCents: 0,
      progressPercent: 0,
    },
    canManageMoney: true,
  };
  return { requests, apiClient, detail, flags };
});

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => state.apiClient,
  useService: () => ({ repository: () => ({}) }),
}));

vi.mock('../../client/components/attachment-manager.js', () => ({
  AttachmentManager: () => null,
}));

const { default: ContractDetailPage } =
  await import('../../client/pages/contracts/detail.js');

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/contracts/7']}>
      <Routes>
        <Route path='/contracts/:id' element={<ContractDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('contract detail user directory', () => {
  beforeEach(() => {
    state.requests.length = 0;
    state.flags.canManage = true;
    state.flags.canManageMembers = true;
  });

  it('requests the directory once the lead detail arrives', async () => {
    renderPage();
    await waitFor(() => {
      expect(state.requests).toContain('delivery/users');
    });
  });

  it('requests the directory for a project manager who assigns owners', async () => {
    state.flags.canManageMembers = false;
    renderPage();
    await waitFor(() => {
      expect(state.requests).toContain('delivery/users');
    });
  });

  it('does not request the directory for a viewer who cannot assign anyone', async () => {
    state.flags.canManage = false;
    state.flags.canManageMembers = false;
    renderPage();
    // Wait until the detail has rendered, which is when a directory request
    // would already have been issued had the page asked for one.
    await screen.findByText('CD-2026-007 · Member scoped contract');
    expect(state.requests).not.toContain('delivery/users');
  });
});
