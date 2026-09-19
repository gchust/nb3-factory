import { usePasswordLogin } from '@nocobase/app-plugin-authentication/client/actions';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';

import { FormStatus } from '../../extensions/nocobase-auth-ui/components/form-status.js';

/**
 * A fictional demo account for each business role, so a reviewer can sign in and
 * try the reimbursement workflow without provisioning anything first. The
 * passwords match the demo seed in `database/main/seeds`.
 *
 * Each role also gets a one-click sign-in button that names the role and the
 * page it opens. Discoverability matters here: an acceptance reviewer is only
 * handed the administrator credentials, and a manager cannot be exercised (or
 * told apart from an employee) unless the manager account is obviously
 * reachable. Typing a username from a static list was enough to be overlooked.
 */
const DEMO_ACCOUNTS = [
  { key: 'employee', username: 'zhangwei', page: 'myExpenses' },
  { key: 'managerEngineering', username: 'wangqiang', page: 'approvals' },
  { key: 'managerMarketing', username: 'zhaomin', page: 'approvals' },
  { key: 'finance', username: 'sunli', page: 'finance' },
  { key: 'admin', username: 'nocobase', page: 'all' },
] as const;

const DEMO_PASSWORD = 'admin123';

export function DemoAccounts(): ReactElement {
  const { t } = useTranslation();
  const login = usePasswordLogin();
  const [activeKey, setActiveKey] = useState<string>();

  const roleLabel = (key: string): string =>
    t(`auth.demo.role.${key}`, { defaultValue: key });
  const pageLabel = (page: string): string =>
    t(`auth.demo.page.${page}`, { defaultValue: page });

  const signIn = async (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setActiveKey(account.key);
    await login.submit({
      identifier: account.username,
      password: DEMO_PASSWORD,
    });
    setActiveKey(undefined);
  };

  return (
    <section
      aria-label={t('auth.demo.title', {
        defaultValue: 'Demo accounts',
      })}
      className='mt-8 rounded-xl border border-border bg-muted/40 p-4 text-sm'
    >
      <h2 className='font-medium text-foreground'>
        {t('auth.demo.title', { defaultValue: 'Demo accounts' })}
      </h2>
      <p className='mt-1 text-muted-foreground'>
        {t('auth.demo.description', {
          defaultValue:
            'Fictional data. Sign in with any account below to try that role. All demo accounts share the password {{password}}.',
          password: DEMO_PASSWORD,
        })}
      </p>
      <ul className='mt-3 space-y-2'>
        {DEMO_ACCOUNTS.map((account) => (
          <li
            key={account.key}
            className='flex flex-wrap items-center justify-between gap-2'
          >
            <span className='flex items-center gap-2'>
              <span className='text-muted-foreground'>
                {roleLabel(account.key)}
              </span>
              <code className='rounded bg-background px-1.5 py-0.5 font-mono text-xs text-foreground'>
                {account.username}
              </code>
            </span>
            <Button
              aria-label={t('auth.demo.signInAs', {
                defaultValue: 'Sign in as {{role}} and open {{page}}',
                page: pageLabel(account.page),
                role: roleLabel(account.key),
              })}
              disabled={login.isPending}
              onClick={() => void signIn(account)}
              size='sm'
              type='button'
              variant='outline'
            >
              {activeKey === account.key
                ? t('auth.demo.signingIn', { defaultValue: 'Signing in…' })
                : t('auth.demo.signIn', { defaultValue: 'Sign in' })}
            </Button>
          </li>
        ))}
      </ul>
      {login.error ? (
        <FormStatus type='error'>{login.error.message}</FormStatus>
      ) : null}
    </section>
  );
}
