import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import locales from '../../client/locales/index.js';
import PipelineSmokePage from '../../client/pages/pipeline-smoke.js';

async function renderPage(locale: string) {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'test-app',
  });
  runtime.registerApplicationNamespace('test-app', locales);
  await runtime.init(locale);
  render(
    <I18nProvider runtime={runtime}>
      <PipelineSmokePage />
    </I18nProvider>,
  );
}

describe('pipeline smoke page', () => {
  it('starts the in-memory counter at zero and increments by one per click', async () => {
    await renderPage('en-US');

    expect(screen.getByText('Pipeline smoke')).toBeInTheDocument();
    expect(
      screen.getByText('Used to verify the automatic setup pipeline.'),
    ).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();

    const increment = screen.getByRole('button', { name: '+1' });
    await userEvent.click(increment);
    expect(screen.getByText('1')).toBeInTheDocument();
    await userEvent.click(increment);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders the Chinese wording', async () => {
    await renderPage('zh-CN');

    expect(screen.getByText('流程冒烟')).toBeInTheDocument();
    expect(screen.getByText('用于验证自动搭建流程')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
