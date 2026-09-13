import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@/hooks/use-announcements', () => ({
  useAnnouncementsApi: () => api,
}));

import AnnouncementsPage from '../../client/pages/announcements.js';

beforeEach(() => {
  api.list.mockReset();
  api.create.mockReset();
});

describe('AnnouncementsPage', () => {
  it('renders the announcements in the order the API returns them', async () => {
    api.list.mockResolvedValue([
      {
        id: 2,
        title: 'Newest',
        body: 'The latest update',
        createdAt: '2026-09-13T10:00:00.000Z',
      },
      {
        id: 1,
        title: 'Older',
        body: 'An earlier update',
        createdAt: '2026-09-12T10:00:00.000Z',
      },
    ]);

    render(<AnnouncementsPage />);

    expect(await screen.findByText('Newest')).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Newest',
      'Older',
    ]);
  });

  it('shows the empty state when there are no announcements', async () => {
    api.list.mockResolvedValue([]);

    render(<AnnouncementsPage />);

    expect(
      await screen.findByText('No announcements yet. Publish the first one.'),
    ).toBeInTheDocument();
  });

  it('publishes an announcement and puts it at the top of the list', async () => {
    api.list.mockResolvedValue([
      {
        id: 1,
        title: 'Older',
        body: 'An earlier update',
        createdAt: '2026-09-12T10:00:00.000Z',
      },
    ]);
    api.create.mockResolvedValue({
      id: 2,
      title: 'Fresh',
      body: 'Just published',
      createdAt: '2026-09-13T10:00:00.000Z',
    });

    render(<AnnouncementsPage />);
    await screen.findByText('Older');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Title'), 'Fresh');
    await user.type(screen.getByLabelText('Body'), 'Just published');
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        title: 'Fresh',
        body: 'Just published',
      }),
    );

    await waitFor(() => {
      const headings = screen.getAllByRole('heading', { level: 3 });
      expect(headings.map((heading) => heading.textContent)).toEqual([
        'Fresh',
        'Older',
      ]);
    });
    // The form clears itself after a successful publish.
    expect(screen.getByLabelText('Title')).toHaveValue('');
  });

  it('does not call the API when a required field is empty', async () => {
    api.list.mockResolvedValue([]);

    render(<AnnouncementsPage />);
    await screen.findByText('No announcements yet. Publish the first one.');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a title.',
    );
    expect(api.create).not.toHaveBeenCalled();
  });

  it('surfaces a server validation error without leaving the page', async () => {
    api.list.mockResolvedValue([]);
    api.create.mockRejectedValue({
      payload: { code: 'TITLE_TOO_LONG' },
    });

    render(<AnnouncementsPage />);
    await screen.findByText('No announcements yet. Publish the first one.');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Title'), 'A title');
    await user.type(screen.getByLabelText('Body'), 'A body');
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Keep the title under 200 characters.',
    );
  });
});
