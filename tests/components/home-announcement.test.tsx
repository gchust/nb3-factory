import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import locales from '../../client/locales/index.js';
import HomePage from '../../client/pages/home.js';

/** The application's real locale registry, so the page is checked against the wording a reader receives. */
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

function renderHome(runtime: I18nRuntime): void {
  render(
    <I18nProvider runtime={runtime}>
      <HomePage />
    </I18nProvider>,
  );
}

const NOTES_BODY =
  'The requirements added in the comments are included in this build.';

describe('home announcement', () => {
  it('shows the headline and source, with the notes collapsed until asked for', async () => {
    renderHome(await createRuntime());

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Build Pipeline Verification',
      }),
    ).toBeVisible();
    expect(screen.getByText('Requirement from TestManage3')).toBeVisible();

    const toggle = screen.getByRole('button', { name: 'Notes' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(NOTES_BODY)).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(NOTES_BODY)).toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(NOTES_BODY)).not.toBeInTheDocument();
  });

  it('renders the Chinese announcement when the language is switched', async () => {
    const runtime = await createRuntime();
    renderHome(runtime);

    await act(() => runtime.changeLanguage('zh-CN'));

    expect(
      screen.getByRole('heading', { level: 1, name: '搭建链路验证' }),
    ).toBeVisible();
    expect(screen.getByText('需求来自 TestManage3')).toBeVisible();
    expect(screen.getByRole('button', { name: '说明' })).toBeVisible();
    expect(
      screen.queryByText('评论追加的需求已包含在本次搭建中'),
    ).not.toBeInTheDocument();
  });
});
