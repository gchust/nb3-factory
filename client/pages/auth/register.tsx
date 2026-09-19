import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { AuthLayout } from '../../extensions/nocobase-auth-ui/components/auth-layout.js';
import { FormStatus } from '../../extensions/nocobase-auth-ui/components/form-status.js';
import { PasswordRegistrationForm } from '../../extensions/nocobase-auth-ui/forms/password-registration-form.js';
import { useRegistrationAction } from './use-registration-action.js';
import { authLogo, authMarketing } from './shared.js';

export default function RegisterPage(): ReactElement {
  const { t } = useTranslation();

  return (
    <AuthLayout
      description={t('auth.registerDescription', {
        defaultValue: 'Create an account to get started.',
      })}
      form={<RegistrationForm />}
      logo={authLogo}
      marketing={authMarketing}
      title={t('auth.registerTitle', { defaultValue: 'Create an account' })}
    />
  );
}

function RegistrationForm(): ReactElement {
  const { t } = useTranslation();
  const action = useRegistrationAction();

  return (
    <>
      {action.isSuccess ? (
        <FormStatus type='success'>
          {t('auth.registrationSucceeded')}
        </FormStatus>
      ) : null}
      <PasswordRegistrationForm action={action} />
    </>
  );
}
