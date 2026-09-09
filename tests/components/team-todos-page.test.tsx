import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { APP_NS, I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';
import TeamTodosPage from '../../client/pages/team-todos.js';

const mocks = vi.hoisted(() => {
  class ApiClientError extends Error {
    readonly code?: string;

    constructor(message: string, code?: string) {
      super(message);
      this.name = 'ApiClientError';
      this.code = code;
    }
  }

  const mockApiClient = { request: vi.fn() };

  return { ApiClientError, mockApiClient };
});

vi.mock('@nocobase/app-client', () => ({
  apiClientToken: { id: 'api-client-token' },
  ApiClientError: mocks.ApiClientError,
  useService: () => mocks.mockApiClient,
}));

interface MockTodo {
  id: number;
  title: string;
  description: string | null;
  status: 'pending' | 'inProgress' | 'completed';
  priority: 'normal' | 'urgent';
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

const SEED_TODOS: MockTodo[] = [
  {
    id: 1,
    title: '整理团队周报',
    description: '汇总本周进展',
    status: 'pending',
    priority: 'normal',
    dueDate: '2026-09-12',
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
  },
  {
    id: 2,
    title: '修复登录页样式问题',
    description: null,
    status: 'pending',
    priority: 'urgent',
    dueDate: null,
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
  },
  {
    id: 3,
    title: '设计新首页原型',
    description: null,
    status: 'inProgress',
    priority: 'normal',
    dueDate: null,
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
  },
  {
    id: 4,
    title: '升级数据库驱动',
    description: null,
    status: 'inProgress',
    priority: 'urgent',
    dueDate: null,
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
  },
  {
    id: 5,
    title: '编写接口文档',
    description: null,
    status: 'completed',
    priority: 'normal',
    dueDate: null,
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
  },
  {
    id: 6,
    title: '配置 CI 缓存',
    description: null,
    status: 'completed',
    priority: 'urgent',
    dueDate: null,
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
  },
];

function computeStats(todos: readonly MockTodo[]): {
  all: number;
  pending: number;
  inProgress: number;
  completed: number;
} {
  return {
    all: todos.length,
    pending: todos.filter((todo) => todo.status === 'pending').length,
    inProgress: todos.filter((todo) => todo.status === 'inProgress').length,
    completed: todos.filter((todo) => todo.status === 'completed').length,
  };
}

let todos: MockTodo[];
let nextId: number;

function installRequestMock() {
  mocks.mockApiClient.request.mockImplementation(
    async ({
      path,
      method,
      json,
      query,
    }: {
      path: string;
      method?: string;
      json?: Partial<MockTodo>;
      query?: { search?: string; status?: string };
    }) => {
      if (method === 'POST' && path === 'team-todos') {
        const created: MockTodo = {
          id: nextId++,
          title: String(json?.title ?? ''),
          description: json?.description ?? null,
          status: (json?.status as MockTodo['status']) ?? 'pending',
          priority: (json?.priority as MockTodo['priority']) ?? 'normal',
          dueDate: json?.dueDate ?? null,
          createdAt: '2026-09-10T00:00:00.000Z',
          updatedAt: '2026-09-10T00:00:00.000Z',
        };
        todos = [created, ...todos];
        return { data: created };
      }
      if (method === 'PUT' && path.startsWith('team-todos/')) {
        const id = Number(path.split('/')[1]);
        const todo = todos.find((item) => item.id === id);
        if (!todo) {
          throw new mocks.ApiClientError('Todo not found.', 'NOT_FOUND');
        }
        Object.assign(todo, json);
        return { data: todo };
      }
      if (method === 'DELETE' && path.startsWith('team-todos/')) {
        const id = Number(path.split('/')[1]);
        todos = todos.filter((item) => item.id !== id);
        return { data: { id } };
      }
      if (path === 'team-todos') {
        let filtered = todos;
        if (query?.status) {
          filtered = filtered.filter((todo) => todo.status === query.status);
        }
        if (query?.search) {
          filtered = filtered.filter((todo) =>
            todo.title.includes(query.search),
          );
        }
        return { data: filtered, stats: computeStats(todos) };
      }
      throw new mocks.ApiClientError('Not found.', 'NOT_FOUND');
    },
  );
}

async function createRuntime(locale: 'zh-CN' | 'en-US'): Promise<I18nRuntime> {
  const runtime = new I18nRuntime({
    defaultLocale: 'zh-CN',
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: APP_NS,
  });
  runtime.registerApplicationNamespace(APP_NS, locales);
  await runtime.init(locale);
  return runtime;
}

async function renderPage(locale: 'zh-CN' | 'en-US' = 'zh-CN') {
  const runtime = await createRuntime(locale);
  render(
    <I18nProvider runtime={runtime}>
      <TeamTodosPage />
    </I18nProvider>,
  );
}

beforeEach(() => {
  todos = SEED_TODOS.map((todo) => ({ ...todo }));
  nextId = 7;
  installRequestMock();
});

describe('TeamTodosPage', () => {
  it('renders stats over all records and the todo list', async () => {
    await renderPage();

    expect(await screen.findByText('团队待办')).toBeInTheDocument();
    // Stat labels also appear inside the status selects, so match all.
    expect(screen.getAllByText('全部').length).toBeGreaterThan(0);
    expect(screen.getAllByText('待处理').length).toBeGreaterThan(0);
    expect(screen.getAllByText('进行中').length).toBeGreaterThan(0);
    expect(screen.getAllByText('已完成').length).toBeGreaterThan(0);

    // Stats: 6 all, 2 per status.
    const statValues = screen.getAllByText(/^[0-9]+$/);
    expect(statValues.map((node) => node.textContent)).toEqual([
      '6',
      '2',
      '2',
      '2',
    ]);

    expect(await screen.findByText('整理团队周报')).toBeInTheDocument();
    expect(screen.getByText('修复登录页样式问题')).toBeInTheDocument();
    expect(screen.getByText('设计新首页原型')).toBeInTheDocument();
    expect(screen.getByText('升级数据库驱动')).toBeInTheDocument();
    expect(screen.getByText('编写接口文档')).toBeInTheDocument();
    expect(screen.getByText('配置 CI 缓存')).toBeInTheDocument();
  });

  it('blocks an empty title with a clear Chinese message', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText('整理团队周报');

    await user.click(screen.getByRole('button', { name: '新建待办' }));
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('标题不能为空')).toBeInTheDocument();
    expect(mocks.mockApiClient.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST' }),
      expect.anything(),
    );
  });

  it('creates a todo through the dialog', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText('整理团队周报');

    await user.click(screen.getByRole('button', { name: '新建待办' }));
    await user.type(screen.getByLabelText('标题 *'), '新任务：评审原型');
    await user.type(screen.getByLabelText('说明'), '周五前完成评审');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('新任务：评审原型')).toBeInTheDocument();
    expect(mocks.mockApiClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'team-todos',
        method: 'POST',
        json: expect.objectContaining({
          title: '新任务：评审原型',
          description: '周五前完成评审',
          status: 'pending',
          priority: 'normal',
        }),
      }),
    );
  });

  it('toggles a todo status inline', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText('整理团队周报');

    const card = screen.getByText('整理团队周报').closest('li')!;
    await user.click(within(card).getByRole('combobox', { name: '状态' }));
    await user.click(await screen.findByRole('option', { name: '进行中' }));

    await waitFor(() => {
      expect(mocks.mockApiClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'team-todos/1',
          method: 'PUT',
          json: { status: 'inProgress' },
        }),
      );
    });
  });

  it('deletes a todo only after confirmation', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText('整理团队周报');

    const card = screen.getByText('整理团队周报').closest('li')!;
    await user.click(within(card).getByRole('button', { name: '删除' }));

    expect(
      await screen.findByText('确定要删除「整理团队周报」吗？此操作不可撤销。'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(mocks.mockApiClient.request).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'team-todos/1', method: 'DELETE' }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByText('整理团队周报')).not.toBeInTheDocument();
    });
  });

  it('searches by title and keeps stats over all records', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText('整理团队周报');

    await user.type(
      screen.getByRole('textbox', { name: '按标题搜索…' }),
      '修复',
    );

    await waitFor(() => {
      expect(screen.queryByText('整理团队周报')).not.toBeInTheDocument();
    });
    expect(screen.getByText('修复登录页样式问题')).toBeInTheDocument();

    // Stats still count every record.
    const statValues = screen.getAllByText(/^[0-9]+$/);
    expect(statValues.map((node) => node.textContent)).toEqual([
      '6',
      '2',
      '2',
      '2',
    ]);
  });

  it('renders English text in the en-US locale', async () => {
    await renderPage('en-US');

    expect(await screen.findByText('Team Todos')).toBeInTheDocument();
    // Stat labels also appear inside the status selects, so match all.
    expect(screen.getAllByText('All').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
    expect(await screen.findByText('整理团队周报')).toBeInTheDocument();
  });

  it('shows translated labels in the status selects instead of raw values', async () => {
    await renderPage();
    await screen.findByText('整理团队周报');

    // The first combobox is the filter select; it shows the translated
    // "all statuses" label.
    const comboboxes = screen.getAllByRole('combobox', { name: '状态' });
    expect(comboboxes[0]).toHaveTextContent('全部状态');

    // Each row select shows the translated status label, not the raw value.
    // (textContent also carries the chevron glyph, so match by substring.)
    const labels = comboboxes.slice(1).map((node) => node.textContent ?? '');
    expect(labels.some((label) => label.includes('待处理'))).toBe(true);
    expect(labels.some((label) => label.includes('进行中'))).toBe(true);
    expect(labels.some((label) => label.includes('已完成'))).toBe(true);
    expect(labels.some((label) => label.includes('pending'))).toBe(false);
    expect(labels.some((label) => label.includes('inProgress'))).toBe(false);
    expect(labels.some((label) => label.includes('completed'))).toBe(false);
  });

  it('uses a localized text input for the due date and validates its format', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText('整理团队周报');

    await user.click(screen.getByRole('button', { name: '新建待办' }));
    const dateInput = screen.getByLabelText('截止日期');
    expect(dateInput).toHaveAttribute('type', 'text');
    expect(dateInput).toHaveAttribute('placeholder', '年-月-日');

    // An invalid format is blocked with a clear Chinese message.
    await user.type(dateInput, '2026/09/20');
    await user.type(screen.getByLabelText('标题 *'), '日期校验任务');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('无效的截止日期。')).toBeInTheDocument();
    expect(mocks.mockApiClient.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST' }),
      expect.anything(),
    );

    // A valid YYYY-MM-DD value submits.
    await user.clear(dateInput);
    await user.type(dateInput, '2026-09-20');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('日期校验任务')).toBeInTheDocument();
    expect(mocks.mockApiClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'team-todos',
        method: 'POST',
        json: expect.objectContaining({ dueDate: '2026-09-20' }),
      }),
    );
  });
});
