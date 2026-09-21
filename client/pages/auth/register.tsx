import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { AuthLayout } from '../../extensions/nocobase-auth-ui/components/auth-layout.js';
import { PasswordRegistrationForm } from '../../extensions/nocobase-auth-ui/forms/password-registration-form.js';
import { useAppPasswordRegistration } from './app-password-registration.js';
import { authLogo, authMarketing } from './shared.js';

export default function RegisterPage(): ReactElement {
  const { t } = useTranslation();
  // The application's own registration action: the built-in sign-up writes a
  // credential account without the `issuer` the authentication schema requires.
  const action = useAppPasswordRegistration();

  return (
    <AuthLayout
      description={t('auth.registerDescription', {
        defaultValue: 'Create an account to get started.',
      })}
      form={<PasswordRegistrationForm action={action} />}
      logo={authLogo}
      marketing={authMarketing}
      title={t('auth.registerTitle', { defaultValue: 'Create an account' })}
    />
  );
}
