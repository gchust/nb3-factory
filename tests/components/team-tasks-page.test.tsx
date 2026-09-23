// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => api,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('@/components/breadcrumbs', () => ({
  Breadcrumbs: () => null,
}));

// The page only needs translation keys, not the locale runtime.
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Radix Select needs measurements jsdom does not provide; the page logic under
// test only cares that the chosen value reaches `onValueChange`.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: ReactNode;
  }) => (
    <select
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

import TeamTasksPage from '../../client/pages/team-tasks.js';

interface Task {
  readonly id: number;
  readonly title: string;
  readonly notes: string | null;
  readonly status: 'pending' | 'done';
}

const sampleTasks: readonly Task[] = [
  {
    id: 1,
    title: 'Prepare the weekly team sync agenda',
    notes: 'Collect blockers first.',
    status: 'pending',
  },
  {
    id: 2,
    title: 'Publish the release notes',
    notes: null,
    status: 'done',
  },
];

function mockList(
  tasks: readonly Task[] = sampleTasks,
  canManage = true,
): void {
  api.request.mockImplementation((options: { method?: string }) => {
    if (options.method === 'POST' || options.method === 'PATCH') {
      return Promise.resolve({
        data: { id: 3, title: 'Saved', notes: null, status: 'pending' },
      });
    }
    return Promise.resolve({ data: tasks, canManage });
  });
}

beforeEach(() => {
  api.request.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

describe('team tasks page', () => {
  it('renders the task list with its fields and status', async () => {
    mockList();
    render(<TeamTasksPage />);

    await waitFor(() =>
      expect(
        screen.getByText('Prepare the weekly team sync agenda'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('Collect blockers first.')).toBeInTheDocument();
    const list = screen.getByRole('list');
    expect(
      within(list).getByText('teamTasks.statusPending'),
    ).toBeInTheDocument();
    expect(within(list).getByText('teamTasks.statusDone')).toBeInTheDocument();
  });

  it('shows the create control to an administrator and hides it for a member', async () => {
    mockList(sampleTasks, false);
    render(<TeamTasksPage />);

    await waitFor(() =>
      expect(
        screen.getByText('Prepare the weekly team sync agenda'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('teamTasks.newTask')).not.toBeInTheDocument();
    expect(screen.getByText('teamTasks.readOnly')).toBeInTheDocument();
  });

  it('reloads the list with the chosen status filter', async () => {
    mockList();
    render(<TeamTasksPage />);

    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(1));
    expect(api.request).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: 'team-tasks' }),
    );

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'done' },
    });

    await waitFor(() =>
      expect(api.request).toHaveBeenLastCalledWith(
        expect.objectContaining({
          path: 'team-tasks',
          query: { status: 'done' },
        }),
      ),
    );
  });

  it('requires a title, then creates the task and reports success', async () => {
    mockList();
    render(<TeamTasksPage />);
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByText('teamTasks.newTask'));
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'actions.save' }),
    );
    expect(
      within(dialog).getByText('teamTasks.titleRequired'),
    ).toBeInTheDocument();
    expect(api.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST' }),
    );

    await userEvent.type(
      within(dialog).getByLabelText('teamTasks.titleLabel'),
      'Write the retro',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'actions.save' }),
    );

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: 'team-tasks',
          json: { title: 'Write the retro', notes: '' },
        }),
      ),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('teamTasks.created'),
    );
  });

  it('prefills the edit form with the task being changed', async () => {
    mockList();
    render(<TeamTasksPage />);
    await waitFor(() =>
      expect(
        screen.getByText('Prepare the weekly team sync agenda'),
      ).toBeInTheDocument(),
    );

    await userEvent.click(screen.getAllByText('teamTasks.edit')[0]);
    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByDisplayValue('Prepare the weekly team sync agenda'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByDisplayValue('Collect blockers first.'),
    ).toBeInTheDocument();
  });

  it('explains an empty list', async () => {
    mockList([], true);
    render(<TeamTasksPage />);

    await waitFor(() =>
      expect(screen.getByText('teamTasks.emptyTitle')).toBeInTheDocument(),
    );
    expect(screen.getByText('teamTasks.emptyDescription')).toBeInTheDocument();
  });
});
