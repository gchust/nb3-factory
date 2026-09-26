import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import locales from '../../client/locales/index.js';
import PipelineSmokePage from '../../client/pages/pipeline-smoke.js';

async function setup(locale = 'en-US') {
  const runtime = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: locale,
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerApplicationNamespace('app', locales);
  await runtime.init(locale);
  render(
    <I18nProvider runtime={runtime}>
      <PipelineSmokePage />
    </I18nProvider>,
  );
  return runtime;
}

describe('PipelineSmokePage', () => {
  it('shows the title, the explanation and a counter starting at zero', async () => {
    await setup();

    expect(
      screen.getByRole('heading', { name: 'Pipeline Smoke' }),
    ).toBeVisible();
    expect(
      screen.getByText('Used to verify the automated build pipeline.'),
    ).toBeVisible();
    expect(
      screen.getByRole('status', { name: 'Current count' }),
    ).toHaveTextContent('0');
  });

  it('increases the count by one on every click', async () => {
    await setup();
    const user = userEvent.setup();
    const count = screen.getByRole('status', { name: 'Current count' });
    const increment = screen.getByRole('button', { name: '+1' });

    await user.click(increment);
    expect(count).toHaveTextContent('1');

    await user.click(increment);
    expect(count).toHaveTextContent('2');
  });

  it('uses the Chinese wording when that locale is active', async () => {
    await setup('zh-CN');

    expect(screen.getByRole('heading', { name: '流程冒烟' })).toBeVisible();
    expect(screen.getByText('用于验证自动搭建流程')).toBeVisible();
    expect(screen.getByRole('button', { name: '+1' })).toBeVisible();
  });
});
