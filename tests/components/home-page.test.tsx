import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import locales from '../../client/locales/index.js';
import HomePage from '../../client/pages/home.js';

async function createRuntime(): Promise<I18nRuntime> {
  const runtime = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerApplicationNamespace('app', locales);
  await runtime.init('en-US');
  return runtime;
}

async function setup(): Promise<I18nRuntime> {
  const runtime = await createRuntime();
  render(
    <I18nProvider runtime={runtime}>
      <HomePage />
    </I18nProvider>,
  );
  return runtime;
}

const englishNotes =
  'The requirements added in the comments are included in this build.';

describe('home announcement page', () => {
  it('shows the announcement with the notes collapsed until asked', async () => {
    await setup();

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Build Pipeline Verification',
      }),
    ).toBeVisible();
    expect(screen.getByText('Requested by TestManage3')).toBeVisible();

    const trigger = screen.getByRole('button', { name: 'Notes' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(englishNotes)).not.toBeInTheDocument();

    await userEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Notes' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText(englishNotes)).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(screen.getByRole('button', { name: 'Notes' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByText(englishNotes)).not.toBeInTheDocument();
  });

  it('translates the announcement and its notes into Chinese', async () => {
    const runtime = await setup();

    await act(() => runtime.changeLanguage('zh-CN'));

    expect(
      screen.getByRole('heading', { level: 1, name: '搭建链路验证' }),
    ).toBeVisible();
    expect(screen.getByText('需求来自 TestManage3')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: '说明' }));
    expect(screen.getByText('评论追加的需求已包含在本次搭建中')).toBeVisible();
  });
});
