import { useSignUpAvailable } from '@nocobase/app-plugin-authentication/client';
import { usePasswordLogin } from '@nocobase/app-plugin-authentication/client/actions';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { PasswordLoginForm } from '@/extensions/nocobase-auth-forms/password-login-form';
import { AuthMethods } from '@/extensions/nocobase-auth-methods/auth-methods';

import { AuthPage } from './shared.js';

export default function LoginPage(): ReactElement {
  const { t } = useTranslation();
  const login = usePasswordLogin();
  // The sign-up link follows the server: it is hidden while `auth.emailAndPassword` turns sign-up off.
  const signUpAvailable = useSignUpAvailable();

  return (
    <AuthPage
      description={t('auth.loginDescription')}
      title={t('auth.welcome')}
    >
      {/* Add another sign-in method to `methods`, or SSO buttons as `providers`; the guest route redirects once
          the session exists. */}
      <AuthMethods
        labels={{
          continueWith: t('auth.continueWith'),
          methods: t('auth.methods'),
          separator: t('auth.or'),
        }}
        methods={[
          {
            content: (
              <PasswordLoginForm
                error={login.error?.message}
                footer={
                  signUpAvailable ? (
                    <>
                      {t('auth.noAccount')}{' '}
                      <Link to='/register'>{t('auth.signUp')}</Link>
                    </>
                  ) : undefined
                }
                forgotPasswordLink={
                  <Link to='/forgot-password'>{t('auth.forgotLink')}</Link>
                }
                labels={{
                  hidePassword: t('auth.hidePassword'),
                  identifier: t('auth.identifier'),
                  password: t('auth.password'),
                  showPassword: t('auth.showPassword'),
                  submit: t('auth.signIn'),
                  submitting: t('auth.signingIn'),
                }}
                onSubmit={login.submit}
                submitting={login.isPending}
              />
            ),
            id: 'password',
            label: t('auth.password'),
          },
        ]}
      />
      {/* The application's internal demo accounts. There is no other channel that hands out credentials, so the
          sign-in page states them. Remove this block once the accounts are no longer wanted. */}
      <div className='mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm'>
        <p className='font-medium'>{t('auth.demoAccounts')}</p>
        <ul className='mt-2 space-y-1 text-muted-foreground'>
          <li>{t('auth.demoOwner')}</li>
          <li>{t('auth.demoColleague')}</li>
        </ul>
        <p className='mt-2 text-muted-foreground'>{t('auth.demoPassword')}</p>
      </div>
    </AuthPage>
  );
}
