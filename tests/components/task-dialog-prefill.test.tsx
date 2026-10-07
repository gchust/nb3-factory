// The task dialog is mounted once by a list and then reused for whichever row the user opens, so the values it shows
// have to follow the `task` prop rather than only the values it saw when it first mounted.
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen } from '@testing-library/react';
import { type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import { TaskDialog } from '../../client/pages/projects/forms.js';
import type { Milestone, Task } from '../../client/pages/projects/types.js';

const { api, toaster } = vi.hoisted(() => ({
  api: { request: vi.fn() },
  toaster: { show: vi.fn(), close: vi.fn() },
}));

vi.mock('@nocobase/app-client', async (original) => ({
  // Keep the real module, so `ApiClientError` stays the class the dialog checks with `instanceof`.
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => api,
  useToaster: () => toaster,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ refresh: vi.fn() }),
}));

const runtime = await createTestI18nRuntime({
  application: {
    namespace: '@nocobase/app-template-default',
    resources: { ...enUS },
  },
});

function I18n({ children }: { readonly children: ReactNode }): ReactElement {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

const MILESTONES: readonly Milestone[] = [
  {
    id: 'milestone-1',
    projectId: 'project-1',
    name: '核心模块',
    description: null,
    dueDate: null,
    status: 'in_progress',
    position: 1,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    taskCount: 1,
    completedTaskCount: 0,
    canComplete: false,
  },
];

function task(overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    projectId: 'project-1',
    milestoneId: null,
    description: null,
    assigneeId: null,
    assigneeName: null,
    status: 'not_started',
    priority: 'normal',
    dueDate: null,
    required: true,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deliverableCount: 0,
    pendingDeliverableCount: 0,
    overdue: false,
    canUpdate: true,
    ...overrides,
  };
}

describe('task dialog', () => {
  beforeEach(() => {
    api.request.mockReset();
    // The assignee picker fills its list from here; an empty directory is enough for this test.
    api.request.mockResolvedValue({ data: [] });
    toaster.show.mockReset();
  });

  it('shows the task it is opened for, not the one it first mounted with', () => {
    const first = task({
      id: 'task-1',
      title: '第一个任务',
      description: '第一个任务的说明',
      dueDate: '2026-02-01',
    });
    const opened = task({
      id: 'task-2',
      title: '第二个任务',
      description: '第二个任务的说明',
      dueDate: '2026-03-15',
    });

    const { rerender } = render(
      <TaskDialog
        milestones={MILESTONES}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
        open={false}
        projectId='project-1'
        task={first}
      />,
      { wrapper: I18n },
    );

    // Opening the dialog for a different row replaces every prefilled field.
    rerender(
      <TaskDialog
        milestones={MILESTONES}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
        open
        projectId='project-1'
        task={opened}
      />,
    );

    expect(screen.getByLabelText(/Title/)).toHaveValue('第二个任务');
    expect(screen.getByLabelText(/Description/)).toHaveValue(
      '第二个任务的说明',
    );
    expect(screen.getByLabelText(/Deadline/)).toHaveValue('2026-03-15');
  });
});
