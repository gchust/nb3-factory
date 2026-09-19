import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BookingStatusBadge } from '../../client/components/booking-status-badge';
import { QueryState } from '../../client/components/query-state';
import { SelectField } from '../../client/components/select-field';

describe('BookingStatusBadge', () => {
  it('renders a readable label for every status', () => {
    const { rerender } = render(<BookingStatusBadge status='pending' />);
    expect(screen.getByText('pending')).toBeInTheDocument();
    for (const status of [
      'confirmed',
      'delivered',
      'returned',
      'settled',
      'cancelled',
    ] as const) {
      rerender(<BookingStatusBadge status={status} />);
      expect(screen.getByText(status)).toBeInTheDocument();
    }
  });
});

describe('QueryState', () => {
  it('shows a loading indicator, then the content', () => {
    const { rerender } = render(
      <QueryState emptyTitle='Empty' loading>
        <p>rows</p>
      </QueryState>,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();

    rerender(
      <QueryState emptyTitle='Empty' loading={false}>
        <p>rows</p>
      </QueryState>,
    );
    expect(screen.getByText('rows')).toBeInTheDocument();
  });

  it('offers a retry when loading failed', async () => {
    const retry = vi.fn();
    render(
      <QueryState
        emptyTitle='Empty'
        error={new Error('boom')}
        loading={false}
        onRetry={retry}
      >
        <p>rows</p>
      </QueryState>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('shows the empty state instead of the content', () => {
    render(
      <QueryState
        emptyDescription='try again'
        emptyTitle='Nothing yet'
        isEmpty
        loading={false}
      >
        <p>rows</p>
      </QueryState>,
    );
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
    expect(screen.queryByText('rows')).not.toBeInTheDocument();
  });
});

describe('SelectField', () => {
  it('renders a labelled trigger with the selected option', () => {
    render(
      <SelectField
        ariaLabel='Status'
        onChange={() => undefined}
        options={[
          { value: 'all', label: 'All' },
          { value: 'pending', label: 'Pending' },
        ]}
        value='pending'
      />,
    );
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });
});
