import { AuthLink } from '@nocobase/app-plugin-authentication/client/ui';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { AuthLayout } from '../components/auth-layout';
import { PasswordRegistrationForm } from '../forms/password-registration-form';

export default function RegisterPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <AuthLayout
      description={t('inspection.register.description', {
        defaultValue: 'Create an account to get started.',
      })}
      footer={
        <p className='text-center text-muted-foreground'>
          {t('inspection.register.haveAccount', {
            defaultValue: 'Already have an account?',
          })}{' '}
          <AuthLink
            className='font-semibold text-foreground underline underline-offset-4'
            to='/login'
          >
            {t('inspection.register.signIn', { defaultValue: 'Sign in' })}
          </AuthLink>
        </p>
      }
      title={t('inspection.register.title', {
        defaultValue: 'Create an account',
      })}
    >
      <PasswordRegistrationForm />
    </AuthLayout>
  );
}
