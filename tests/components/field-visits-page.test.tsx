import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FieldVisit } from '../../client/pages/field-visits/api.js';
import FieldVisitsPage from '../../client/pages/field-visits/index.tsx';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => ({ request }),
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      typeof options?.count === 'number' ? `${options.count} records` : key,
  }),
}));

function record(overrides: Partial<FieldVisit>): FieldVisit {
  return {
    id: 1,
    customerName: 'Acme',
    visitDate: '2026-09-01',
    conclusion: 'satisfied',
    engineerName: 'Chen',
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('field visits page', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('renders the records and the total count', async () => {
    request.mockResolvedValue({
      data: [
        record({ id: 2, customerName: 'Blue Ocean', visitDate: '2026-09-10' }),
        record({ id: 1 }),
      ],
      total: 2,
    });

    render(<FieldVisitsPage />);

    expect(await screen.findByText('Blue Ocean')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('2 records')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'field-visits' }),
    );
  });

  it('shows an empty state when nothing matches', async () => {
    request.mockResolvedValue({ data: [], total: 0 });

    render(<FieldVisitsPage />);

    expect(await screen.findByText('fieldVisits.empty')).toBeInTheDocument();
    expect(screen.getByText('0 records')).toBeInTheDocument();
  });

  it('offers a retry when loading fails', async () => {
    request.mockRejectedValueOnce(new Error('Network unavailable'));
    request.mockResolvedValueOnce({ data: [record({})], total: 1 });

    render(<FieldVisitsPage />);

    expect(
      await screen.findByText('fieldVisits.loadFailed'),
    ).toBeInTheDocument();
    const retry = screen.getByRole('button', {
      name: 'status.retry',
    });
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByText('Acme')).toBeInTheDocument());
  });
});
