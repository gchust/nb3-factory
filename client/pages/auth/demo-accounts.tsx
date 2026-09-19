import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

/**
 * A fictional demo account for each business role, so a reviewer can sign in and
 * try the reimbursement workflow without provisioning anything first. The
 * passwords match the demo seed in `database/main/seeds`.
 */
const DEMO_ACCOUNTS = [
  { key: 'employee', username: 'zhangwei' },
  { key: 'managerEngineering', username: 'wangqiang' },
  { key: 'managerMarketing', username: 'zhaomin' },
  { key: 'finance', username: 'sunli' },
  { key: 'admin', username: 'nocobase' },
] as const;

const DEMO_PASSWORD = 'admin123';

export function DemoAccounts(): ReactElement {
  const { t } = useTranslation();

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
      <ul className='mt-3 space-y-1.5'>
        {DEMO_ACCOUNTS.map((account) => (
          <li
            key={account.key}
            className='flex items-baseline justify-between gap-3'
          >
            <span className='text-muted-foreground'>
              {t(`auth.demo.role.${account.key}`, {
                defaultValue: account.key,
              })}
            </span>
            <code className='rounded bg-background px-1.5 py-0.5 font-mono text-xs text-foreground'>
              {account.username}
            </code>
          </li>
        ))}
      </ul>
    </section>
  );
}
