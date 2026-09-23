import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import locales from '../../client/locales/index.js';
import PipelineSmokePage from '../../client/pages/pipeline-smoke.js';

async function runtime() {
  const value = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  value.registerApplicationNamespace('app', locales);
  await value.init('en-US');
  return value;
}

describe('pipeline smoke page', () => {
  it('increments the in-memory counter on each click', async () => {
    const value = await runtime();
    render(
      <I18nProvider runtime={value}>
        <PipelineSmokePage />
      </I18nProvider>,
    );

    expect(
      screen.getByRole('heading', { name: 'Pipeline Smoke' }),
    ).toBeVisible();
    expect(
      screen.getByText('Used to verify the automated build pipeline.'),
    ).toBeVisible();

    const count = screen.getByLabelText('Count');
    expect(count).toHaveTextContent('0');

    const increment = screen.getByRole('button', { name: '+1' });
    await userEvent.click(increment);
    expect(count).toHaveTextContent('1');
    await userEvent.click(increment);
    expect(count).toHaveTextContent('2');
  });

  it('renders the translated page in Chinese', async () => {
    const value = await runtime();
    render(
      <I18nProvider runtime={value}>
        <PipelineSmokePage />
      </I18nProvider>,
    );

    await act(() => value.changeLanguage('zh-CN'));
    expect(screen.getByRole('heading', { name: '流程冒烟' })).toBeVisible();
    expect(screen.getByText('用于验证自动搭建流程。')).toBeVisible();
    expect(screen.getByRole('button', { name: '+1' })).toBeVisible();
  });
});
