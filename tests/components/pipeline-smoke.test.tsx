import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import locales from '../../client/locales/index.js';
import PipelineSmokePage from '../../client/pages/pipeline-smoke.js';

async function runtime(locale: string) {
  const value = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  value.registerApplicationNamespace('app', locales);
  await value.init(locale);
  return value;
}

describe('pipeline smoke page', () => {
  it('starts at zero and increments by one on every click', async () => {
    const user = userEvent.setup();
    const value = await runtime('en-US');
    render(
      <I18nProvider runtime={value}>
        <PipelineSmokePage />
      </I18nProvider>,
    );

    expect(
      screen.getByRole('heading', { name: 'Pipeline smoke' }),
    ).toBeVisible();
    expect(
      screen.getByText('Used to verify the automated build pipeline'),
    ).toBeVisible();
    expect(screen.getByText('0')).toBeVisible();

    const increment = screen.getByRole('button', { name: '+1' });
    await user.click(increment);
    expect(screen.getByText('1')).toBeVisible();
    await user.click(increment);
    expect(screen.getByText('2')).toBeVisible();
  });

  it('shows the Chinese wording when the language changes', async () => {
    const value = await runtime('en-US');
    render(
      <I18nProvider runtime={value}>
        <PipelineSmokePage />
      </I18nProvider>,
    );

    await act(() => value.changeLanguage('zh-CN'));

    expect(screen.getByRole('heading', { name: '流程冒烟' })).toBeVisible();
    expect(screen.getByText('用于验证自动搭建流程')).toBeVisible();
    expect(screen.getByRole('button', { name: '+1' })).toBeVisible();
  });
});
