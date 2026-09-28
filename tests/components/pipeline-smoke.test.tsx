import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import locales from '../../client/locales/index.js';
import PipelineSmokePage from '../../client/pages/pipeline-smoke.js';

async function createRuntime() {
  const runtime = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerApplicationNamespace('app', locales);
  await runtime.init('en-US');
  return runtime;
}

describe('Pipeline Smoke page', () => {
  it('starts at zero and adds one per click', async () => {
    const runtime = await createRuntime();
    render(
      <I18nProvider runtime={runtime}>
        <PipelineSmokePage />
      </I18nProvider>,
    );

    expect(
      screen.getByRole('heading', { name: 'Pipeline Smoke' }),
    ).toBeVisible();
    expect(
      screen.getByText('Used to verify the automated build pipeline'),
    ).toBeVisible();
    expect(screen.getByText('0')).toBeVisible();

    const increment = screen.getByRole('button', { name: '+1' });
    fireEvent.click(increment);
    expect(screen.getByText('1')).toBeVisible();
    fireEvent.click(increment);
    expect(screen.getByText('2')).toBeVisible();
  });

  it('renders the Chinese wording after a language change', async () => {
    const runtime = await createRuntime();
    render(
      <I18nProvider runtime={runtime}>
        <PipelineSmokePage />
      </I18nProvider>,
    );

    await act(() => runtime.changeLanguage('zh-CN'));

    expect(screen.getByRole('heading', { name: '流程冒烟' })).toBeVisible();
    expect(screen.getByText('用于验证自动搭建流程')).toBeVisible();
    expect(screen.getByRole('button', { name: '+1' })).toBeVisible();
  });
});
