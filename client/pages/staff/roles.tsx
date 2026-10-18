import { useApiClient, useToaster } from '@nocobase/app-client';
import { UsersClient } from '@nocobase/app-plugin-users/client/user-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import { useRouteOverlay } from '#components/use-route-overlay';

import { roleScopeValues, type StaffOutletContext } from './types.js';

/** Route `/staff/:userId`: assign this person's permission sets. */
export default function StaffRolesPage(): ReactElement {
  const { userId = '' } = useParams();
  return <StaffRoles key={userId} userId={userId} />;
}

function StaffRoles({ userId }: { readonly userId: string }): ReactElement {
  const { t } = useTranslation();
  const { users, options } = useOutletContext<StaffOutletContext>();
  const user = users?.find((candidate) => candidate.id === userId);
  const scope = options?.roleScopes.find((item) => item.key === 'app');

  // Derive the current selection from the loaded user until the editor changes it; no effect and no spinner needed.
  const initialValue = roleScopeValues(user?.roleScopes.app);
  const [edited, setEdited] = useState<string[] | undefined>(undefined);
  const value = edited ?? initialValue;

  // A protected assignment such as `root` cannot be granted or revoked here; show it, but do not let a save drop it.
  const lockedValues = new Set(
    (scope?.options ?? [])
      .filter((option) => option.assignable === false)
      .map((option) => option.value),
  );
  const locked = value.some((candidate) => lockedValues.has(candidate));

  let body: ReactElement;
  if (!options) {
    body = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-3'
      >
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-8 w-full' />
      </div>
    );
  } else if (!user || !scope) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('staff.roles.notFound')}</AlertDescription>
      </Alert>
    );
  } else {
    body = (
      <div className='space-y-4 text-sm'>
        <p className='text-muted-foreground'>
          {t('staff.roles.description', { name: user.name })}
        </p>
        {locked ? (
          <Alert>
            <AlertCircleIcon />
            <AlertDescription>{t('staff.roles.locked')}</AlertDescription>
          </Alert>
        ) : null}
        <div className='space-y-3'>
          {scope.options.map((option) => {
            const optionLocked = option.assignable === false;
            const label = option.label;
            return (
              <label
                key={option.value}
                className='flex items-start gap-3 rounded-lg border p-3'
              >
                <Checkbox
                  checked={value.includes(option.value)}
                  disabled={optionLocked}
                  onCheckedChange={(checked) => {
                    setEdited(
                      checked
                        ? [...value, option.value]
                        : value.filter(
                            (candidate) => candidate !== option.value,
                          ),
                    );
                  }}
                />
                <span className='flex flex-col gap-0.5'>
                  <span className='font-medium'>{label}</span>
                  {option.description ? (
                    <span className='text-muted-foreground'>
                      {option.description}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <RouteDialog
      title={t('staff.roles.title')}
      className='sm:max-w-md'
      footer={
        user && scope && !locked ? (
          <RolesFooter userId={userId} value={value} />
        ) : (
          <RolesClose />
        )
      }
    >
      {body}
    </RouteDialog>
  );
}

function RolesFooter({
  userId,
  value,
}: {
  readonly userId: string;
  readonly value: string[];
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<StaffOutletContext>();
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSave(): Promise<void> {
    setSubmitting(true);
    setFailed(false);
    try {
      await new UsersClient(api).replaceRoleScope(userId, 'app', value);
    } catch {
      setFailed(true);
      return;
    } finally {
      setSubmitting(false);
    }
    toaster.show({ type: 'success', title: t('staff.roles.success') });
    // Refresh the list first, so the row shows the new sets even if closing is slow.
    reload();
    void close();
  }

  return (
    <>
      {failed ? (
        <Alert variant='destructive'>
          <AlertDescription>
            {t('materials.error.requestFailed')}
          </AlertDescription>
        </Alert>
      ) : null}
      <RolesClose disabled={submitting} />
      <Button
        type='button'
        disabled={submitting}
        onClick={() => void handleSave()}
      >
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}

function RolesClose({
  disabled = false,
}: {
  readonly disabled?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <Button
      type='button'
      variant='outline'
      disabled={disabled || isClosing}
      onClick={() => void close()}
    >
      {t('actions.close')}
    </Button>
  );
}
