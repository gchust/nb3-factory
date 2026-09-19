import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { TRIAL_ACCOUNTS, TRIAL_PASSWORD } from './trial-credentials.js';

export function TrialAccountsPanel(): ReactElement {
  const { t } = useTranslation();

  return (
    <section
      aria-label={t('auth.trialTitle', { defaultValue: 'Trial accounts' })}
      className='mt-6 rounded-xl border border-border bg-muted/40 p-4 text-sm'
    >
      <h2 className='font-medium'>
        {t('auth.trialTitle', { defaultValue: 'Trial accounts' })}
      </h2>
      <p className='mt-1 text-xs text-muted-foreground'>
        {t('auth.trialDescription', {
          defaultValue:
            'The sample data is fictitious. Sign in with any account below to try that role.',
        })}
      </p>
      <ul className='mt-3 space-y-2'>
        {TRIAL_ACCOUNTS.map((account) => (
          <li key={account.username} className='flex flex-col gap-0.5'>
            <code className='font-mono text-xs'>{account.username}</code>
            <span className='text-xs text-muted-foreground'>
              {t(account.roleKey, { defaultValue: account.roleDefault })}
            </span>
          </li>
        ))}
      </ul>
      <p className='mt-3 text-xs text-muted-foreground'>
        {t('auth.trialPassword', { defaultValue: 'Password' })}:{' '}
        <code className='font-mono'>{TRIAL_PASSWORD}</code>
      </p>
    </section>
  );
}
