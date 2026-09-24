import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, fireEvent, render, screen } from '@testing-library/react';
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
  it('starts at zero and adds one on every click', async () => {
    const value = await runtime();
    render(
      <I18nProvider runtime={value}>
        <PipelineSmokePage />
      </I18nProvider>,
    );

    expect(screen.getByText('0')).toBeVisible();
    const button = screen.getByRole('button', { name: '+1' });
    fireEvent.click(button);
    expect(screen.getByText('1')).toBeVisible();
    fireEvent.click(button);
    expect(screen.getByText('2')).toBeVisible();
  });

  it('shows the localized title and description', async () => {
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

    await act(() => value.changeLanguage('zh-CN'));
    expect(screen.getByRole('heading', { name: '流程冒烟' })).toBeVisible();
    expect(screen.getByText('用于验证自动搭建流程')).toBeVisible();
  });
});
