import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression: the create dialogs stay mounted while the project list loads. The
 * milestone form used to capture the first option only in its initial state, so
 * when the project list arrived after mount the native select displayed the
 * first project while the submitted value stayed empty and became
 * `projectId: 0` (HTTP 400). These tests reproduce that ordering and assert the
 * effective project is submitted.
 */
const hoisted = vi.hoisted(() => {
  const api = {
    me: vi.fn(),
    listProjects: vi.fn(),
    listMilestones: vi.fn(),
    createMilestone: vi.fn(),
    updateMilestone: vi.fn(),
    members: vi.fn(),
    listTasks: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
  };
  return { api };
});

vi.mock('@/components/delivery/delivery-api', () => ({
  useDeliveryApi: () => hoisted.api,
  deliveryErrorMessage: () => 'DELIVERY_UNKNOWN_ERROR',
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import DeliveryMilestonesPage from '@/pages/delivery-milestones';
import DeliveryTasksPage from '@/pages/delivery-tasks';

const PROJECT = { id: 7, name: 'QA Delivery Project' };

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.api.me.mockResolvedValue({ userId: 'm1', role: 'manager' });
  hoisted.api.listMilestones.mockResolvedValue([]);
  hoisted.api.members.mockResolvedValue([]);
  hoisted.api.listTasks.mockResolvedValue([]);
  hoisted.api.createMilestone.mockImplementation(
    async (input: Record<string, unknown>) => ({ id: 99, ...input }),
  );
  hoisted.api.createTask.mockImplementation(
    async (input: Record<string, unknown>) => ({ id: 99, ...input }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('milestone create form', () => {
  it('submits the first project even when the project list loads after mount', async () => {
    const projects = deferred<unknown[]>();
    hoisted.api.listProjects.mockReturnValue(projects.promise);

    render(<DeliveryMilestonesPage />);

    const createButton = await screen.findByRole('button', {
      name: 'delivery.milestones.create',
    });
    fireEvent.click(createButton);

    const nameInput = (await screen.findByLabelText(
      'delivery.fields.name',
    )) as HTMLInputElement;

    // The project list resolves only now, after the dialog has mounted.
    projects.resolve([PROJECT]);

    await waitFor(() => {
      const select = document.querySelector(
        '#milestone-project',
      ) as HTMLSelectElement;
      expect(select.value).toBe('7');
    });

    fireEvent.change(nameInput, { target: { value: 'QA Milestone 1' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'delivery.actions.save' }),
    );

    await waitFor(() => {
      expect(hoisted.api.createMilestone).toHaveBeenCalledTimes(1);
    });
    expect(hoisted.api.createMilestone).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 7, name: 'QA Milestone 1' }),
    );
  });
});

describe('task create form', () => {
  it('submits the first project even when the project list loads after mount', async () => {
    const projects = deferred<unknown[]>();
    hoisted.api.listProjects.mockReturnValue(projects.promise);

    render(<DeliveryTasksPage />);

    const createButton = await screen.findByRole('button', {
      name: 'delivery.tasks.create',
    });
    fireEvent.click(createButton);

    const nameInput = (await screen.findByLabelText(
      'delivery.fields.name',
    )) as HTMLInputElement;

    projects.resolve([PROJECT]);

    await waitFor(() => {
      const select = document.querySelector(
        '#task-project',
      ) as HTMLSelectElement;
      expect(select.value).toBe('7');
    });

    fireEvent.change(nameInput, { target: { value: 'Task A Future' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'delivery.actions.save' }),
    );

    await waitFor(() => {
      expect(hoisted.api.createTask).toHaveBeenCalledTimes(1);
    });
    expect(hoisted.api.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 7, name: 'Task A Future' }),
    );
  });
});
