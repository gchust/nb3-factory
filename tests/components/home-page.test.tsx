import { render, screen } from '@testing-library/react';
import { APP_NS, I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';
import HomePage from '../../client/pages/home.js';

const mocks = vi.hoisted(() => {
  const mockApiClient = { request: vi.fn() };
  return { mockApiClient };
});

vi.mock('@nocobase/app-client', () => ({
  apiClientToken: { id: 'api-client-token' },
  useService: () => mocks.mockApiClient,
}));

vi.mock('@refinedev/core', () => ({
  useGetIdentity: () => ({ data: { id: 'user-1', fullName: '张三' } }),
}));

vi.mock(
  '@nocobase/app-plugin-skills-example/client/components/app-notice',
  () => ({
    AppNotice: () => <div>notice</div>,
  }),
);

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

async function renderPage(locale: 'zh-CN' | 'en-US') {
  const runtime = await createRuntime(locale);
  render(
    <I18nProvider runtime={runtime}>
      <HomePage />
    </I18nProvider>,
  );
}

beforeEach(() => {
  mocks.mockApiClient.request.mockResolvedValue({});
});

describe('HomePage', () => {
  it('renders the Chinese title and welcome text in zh-CN', async () => {
    await renderPage('zh-CN');

    expect(screen.getByText('开始使用你的 AI Agent 构建')).toBeInTheDocument();
    expect(screen.getByText(/欢迎，张三。/)).toBeInTheDocument();
    expect(
      screen.getByText(/描述你的需求，AI Agent 将帮助你完成构建。/),
    ).toBeInTheDocument();
  });

  it('renders the English title and welcome text in en-US', async () => {
    await renderPage('en-US');

    expect(
      screen.getByText('Start building with your AI Agent'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Welcome, 张三\./)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Describe what you need, and your AI Agent will help you build it\./,
      ),
    ).toBeInTheDocument();
  });
});
