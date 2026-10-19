import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import {
  UsersClient,
  isEmailAddress,
} from '@nocobase/app-plugin-users/client/user-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';

import { RouteDialog } from '#components/route-dialog';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import { Button } from '#components/ui/button';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
import { Input } from '#components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { useRouteOverlay } from '#components/use-route-overlay';

import { TEAM_ROLES, roleLabel, type TeamRole } from './types.js';

const FORM_ID = 'it-team-member-form';

export default function AddTeamMemberPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const changeSubmitting = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('serviceDesk.create.title')}
      description={t('serviceDesk.create.description')}
      beforeClose={() => !submittingRef.current}
      footer={<DialogFooter submitting={submitting} />}
    >
      <AddMemberForm onSubmittingChange={changeSubmitting} />
    </RouteDialog>
  );
}

function DialogFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting
          ? t('serviceDesk.create.submitting')
          : t('serviceDesk.create.submit')}
      </Button>
    </>
  );
}

function AddMemberForm({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const toaster = useToaster();
  const queryClient = useQueryClient();
  const { close } = useRouteOverlay();
  const users = useMemo(() => new UsersClient(api), [api]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<TeamRole>('it-engineer');
  const [error, setError] = useState<unknown>();
  const [fieldErrors, setFieldErrors] = useState<{
    readonly name?: string;
    readonly email?: string;
    readonly password?: string;
  }>({});

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
    const nextErrors: {
      name?: string;
      email?: string;
      password?: string;
    } = {};
    if (!name.trim()) nextErrors.name = t('serviceDesk.create.nameRequired');
    if (!email.trim()) nextErrors.email = t('serviceDesk.create.emailRequired');
    else if (!isEmailAddress(email.trim())) {
      nextErrors.email = t('serviceDesk.create.emailInvalid');
    }
    if (password.length < 8) {
      nextErrors.password = t('serviceDesk.create.passwordTooShort');
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    onSubmittingChange(true);
    let saved = false;
    try {
      await users.create({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        roleScopes: { app: [role] },
      });
      await queryClient.invalidateQueries({ queryKey: ['it-team', 'users'] });
      await queryClient.invalidateQueries({ queryKey: ['it-tickets'] });
      void toaster.show({
        type: 'success',
        title: t('serviceDesk.create.created'),
      });
      saved = true;
    } catch (caught) {
      setError(caught);
    }
    onSubmittingChange(false);
    if (saved) await close();
  }

  const status = error instanceof ApiClientError ? error.status : undefined;

  return (
    <form id={FORM_ID} onSubmit={(event) => void submit(event)}>
      <FieldGroup>
        <Field data-invalid={Boolean(fieldErrors.name)}>
          <FieldLabel htmlFor='it-team-name'>
            {t('serviceDesk.fields.name')}
          </FieldLabel>
          <Input
            id='it-team-name'
            value={name}
            autoComplete='name'
            aria-invalid={Boolean(fieldErrors.name)}
            onChange={(event) => setName(event.target.value)}
          />
          {fieldErrors.name ? (
            <p role='alert' className='text-sm text-destructive'>
              {fieldErrors.name}
            </p>
          ) : null}
        </Field>

        <Field data-invalid={Boolean(fieldErrors.email)}>
          <FieldLabel htmlFor='it-team-email'>
            {t('serviceDesk.fields.email')}
          </FieldLabel>
          <Input
            id='it-team-email'
            type='email'
            value={email}
            autoComplete='email'
            aria-invalid={Boolean(fieldErrors.email)}
            onChange={(event) => setEmail(event.target.value)}
          />
          <FieldDescription>
            {t('serviceDesk.create.emailHint')}
          </FieldDescription>
          {fieldErrors.email ? (
            <p role='alert' className='text-sm text-destructive'>
              {fieldErrors.email}
            </p>
          ) : null}
        </Field>

        <Field data-invalid={Boolean(fieldErrors.password)}>
          <FieldLabel htmlFor='it-team-password'>
            {t('serviceDesk.fields.password')}
          </FieldLabel>
          <Input
            id='it-team-password'
            type='password'
            value={password}
            autoComplete='new-password'
            aria-invalid={Boolean(fieldErrors.password)}
            onChange={(event) => setPassword(event.target.value)}
          />
          <FieldDescription>
            {t('serviceDesk.create.passwordHint')}
          </FieldDescription>
          {fieldErrors.password ? (
            <p role='alert' className='text-sm text-destructive'>
              {fieldErrors.password}
            </p>
          ) : null}
        </Field>

        <Field>
          <FieldLabel htmlFor='it-team-role'>
            {t('serviceDesk.fields.role')}
          </FieldLabel>
          <Select
            value={role}
            onValueChange={(value) => {
              if (typeof value === 'string') setRole(value);
            }}
          >
            <SelectTrigger id='it-team-role' className='w-full'>
              <SelectValue>{roleLabel(t, role)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {TEAM_ROLES.map((option) => (
                <SelectItem key={option} value={option}>
                  {roleLabel(t, option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            {t('serviceDesk.create.roleHint')}
          </FieldDescription>
        </Field>

        {status === 401 ? (
          <SessionExpiredAlert />
        ) : error ? (
          <p role='alert' className='text-sm text-destructive'>
            {status === 409
              ? t('serviceDesk.create.emailTaken')
              : status === 403
                ? t('itTickets.errors.forbidden')
                : t('itTickets.errors.requestFailed')}
          </p>
        ) : null}
      </FieldGroup>
    </form>
  );
}
