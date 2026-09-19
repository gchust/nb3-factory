import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';
import RegisterPage from '../../client/pages/auth/register.js';

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), refresh: vi.fn() }));

vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    client: { signUp: { email: mocks.signUp } },
    refresh: mocks.refresh,
  }),
}));

// The form always calls its default hook even when an action is injected, so
// stub it to avoid needing the real authentication provider context.
vi.mock('@nocobase/app-plugin-authentication/client/actions', () => ({
  usePasswordRegistration: () => ({ isPending: false, submit: vi.fn() }),
  usePasswordLogin: () => ({ isPending: false, submit: vi.fn() }),
}));

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

function fillForm(container: HTMLElement): void {
  const set = (selector: string, value: string): void => {
    fireEvent.change(container.querySelector(selector)!, {
      target: { value },
    });
  };
  set('#name', '测试用户');
  set('#username', 'dupetest');
  set('#register-email', 'dupe@example.com');
  set('#register-password', 'Demo12345!');
  set('#confirm-password', 'Demo12345!');
  fireEvent.submit(container.querySelector('form')!);
}

describe('registration failure messages', () => {
  it('shows a localized reason for a taken username instead of "Bad Request"', async () => {
    const value = await runtime();
    const failure = new Error('Bad Request') as Error & { error?: unknown };
    failure.error = {
      code: 'USERNAME_IS_ALREADY_TAKEN',
      message: 'Username is already taken. Please try another.',
    };
    mocks.signUp.mockRejectedValue(failure);

    const { container } = render(
      <I18nProvider runtime={value}>
        <RegisterPage />
      </I18nProvider>,
    );
    await act(() => value.changeLanguage('zh-CN'));
    fillForm(container);

    expect(
      await screen.findByText('该用户名已被使用，请更换一个。'),
    ).toBeVisible();
  });

  it('never surfaces a bare HTTP status text', async () => {
    const value = await runtime();
    mocks.signUp.mockRejectedValue(new Error('Bad Request'));

    const { container } = render(
      <I18nProvider runtime={value}>
        <RegisterPage />
      </I18nProvider>,
    );
    await act(() => value.changeLanguage('zh-CN'));
    fillForm(container);

    await waitFor(() =>
      expect(screen.getByText('注册失败，请稍后重试。')).toBeVisible(),
    );
  });
});
