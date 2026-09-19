import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Fictional accounts created by `202609190002_seed_training_demo`, shown so each
 * role can be tried without guessing a password. They are demo data: a
 * deployment that removes the seed removes the reason to render this.
 */
export const DEMO_PASSWORD = 'Train@2026';

interface DemoAccount {
  readonly username: string;
  readonly roleKey: 'admin' | 'instructor' | 'student';
}

const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { username: 'admin.train', roleKey: 'admin' },
  { username: 'instructor.li', roleKey: 'instructor' },
  { username: 'student.zhao', roleKey: 'student' },
];

export function DemoAccounts(): ReactElement {
  const { t } = useTranslation();
  return (
    <Card className='gap-3'>
      <CardHeader>
        <CardTitle className='text-sm'>{t('demo.title')}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3 text-sm text-muted-foreground'>
        <p>{t('demo.description')}</p>
        <ul className='space-y-1.5'>
          {DEMO_ACCOUNTS.map((account) => (
            <li
              key={account.username}
              className='flex items-center justify-between gap-3'
            >
              <code className='font-mono text-xs text-foreground'>
                {account.username}
              </code>
              <span>{t(`training.roles.${account.roleKey}`)}</span>
            </li>
          ))}
        </ul>
        <p className='font-mono text-xs text-foreground'>
          {t('demo.password', { password: DEMO_PASSWORD })}
        </p>
      </CardContent>
    </Card>
  );
}

export default DemoAccounts;
