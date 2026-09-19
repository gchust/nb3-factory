import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { DemoAccounts } from '@/components/demo-accounts';
import { AuthLayout } from '../../extensions/nocobase-auth-ui/components/auth-layout.js';
import { PasswordLoginForm } from '../../extensions/nocobase-auth-ui/forms/password-login-form.js';
import { authLogo, authMarketing } from './shared.js';

export default function LoginPage(): ReactElement {
  const { t } = useTranslation();

  return (
    <AuthLayout
      description={t('auth.loginDescription', {
        defaultValue: 'Sign in with your username or email and password.',
      })}
      form={
        <div className='space-y-6'>
          <PasswordLoginForm />
          <DemoAccounts />
        </div>
      }
      logo={authLogo}
      marketing={authMarketing}
      title={t('auth.welcome', { defaultValue: 'Welcome back' })}
    />
  );
}
