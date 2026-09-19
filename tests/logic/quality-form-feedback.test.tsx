import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';
import CreateTaskPage from '../../client/pages/quality/tasks/create.js';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => ({ request: mockRequest }),
  ApiClientError: class ApiClientError extends Error {},
}));

async function renderCreateTask(): Promise<ReturnType<typeof userEvent.setup>> {
  const runtime = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'zh-CN',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerApplicationNamespace('app', locales);
  await runtime.init('zh-CN');

  render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter initialEntries={['/quality/tasks/create']}>
        <CreateTaskPage />
      </MemoryRouter>
    </I18nProvider>,
  );

  await screen.findByRole('button', { name: '创建任务' });
  return userEvent.setup();
}

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockImplementation(
    async ({ path, method }: { path: string; method?: string }) => {
      if (path === 'quality/batches') {
        return {
          data: [
            {
              id: 'batch-1',
              batchNo: 'B-2026-001',
              productCode: 'P-1001',
              productName: '精密轴承',
            },
          ],
        };
      }
      if (path === 'quality/assignable-users') {
        return {
          data: {
            inspectors: [{ id: 'inspector-1', name: '检验员 李强' }],
            productionLeads: [{ id: 'lead-1', name: '生产负责人 赵磊' }],
          },
        };
      }
      if (path === 'quality/tasks' && method === 'POST') {
        return { data: { id: 'task-1' } };
      }
      return { data: null };
    },
  );
});

describe('new inspection task form feedback', () => {
  it('shows localized field errors instead of sending an invalid request', async () => {
    const user = await renderCreateTask();

    await user.click(screen.getByRole('button', { name: '创建任务' }));

    expect(await screen.findByText('请选择生产批次。')).toBeVisible();
    expect(screen.getByText('请选择检验员。')).toBeVisible();
    expect(screen.getByText('请选择生产负责人。')).toBeVisible();
    expect(screen.getByText('请输入检查项名称。')).toBeVisible();
    expect(screen.getByText('请修正标红的字段后重试。')).toBeVisible();

    // The invalid draft must not reach the server, so no 400 is produced.
    const posts = mockRequest.mock.calls.filter(
      ([options]) =>
        (options as { path: string; method?: string }).path ===
          'quality/tasks' && (options as { method?: string }).method === 'POST',
    );
    expect(posts).toHaveLength(0);
  });

  it('clears the item error once a check-item name is entered', async () => {
    const user = await renderCreateTask();

    await user.click(screen.getByRole('button', { name: '创建任务' }));
    expect(await screen.findByText('请输入检查项名称。')).toBeVisible();

    const itemName = screen.getByLabelText('检查项', { exact: true });
    await user.type(itemName, '外观');
    await waitFor(() =>
      expect(screen.queryByText('请输入检查项名称。')).toBeNull(),
    );
  });
});
