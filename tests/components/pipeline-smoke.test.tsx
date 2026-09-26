import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import locales from '../../client/locales/index.js';
import PipelineSmokePage from '../../client/pages/pipeline-smoke/index.js';

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

describe('PipelineSmokePage', () => {
  it('starts at zero and increments by one on each click', async () => {
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

    const count = screen.getByLabelText('Current count');
    expect(count).toHaveTextContent('0');

    const increment = screen.getByRole('button', { name: '+1' });
    fireEvent.click(increment);
    expect(count).toHaveTextContent('1');
    fireEvent.click(increment);
    fireEvent.click(increment);
    expect(count).toHaveTextContent('3');
  });

  it('renders its Chinese wording', async () => {
    const value = await runtime();
    await value.changeLanguage('zh-CN');
    render(
      <I18nProvider runtime={value}>
        <PipelineSmokePage />
      </I18nProvider>,
    );

    expect(screen.getByRole('heading', { name: '流程冒烟' })).toBeVisible();
    expect(screen.getByText('用于验证自动搭建流程。')).toBeVisible();
    expect(screen.getByRole('button', { name: '+1' })).toBeVisible();
  });
});
