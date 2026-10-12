import { useApiClient, useToaster } from '@nocobase/app-client';
import { UsersClient } from '@nocobase/app-plugin-users/client/user-client';
import type { ManagedUser } from '@nocobase/app-plugin-users/client/user-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';

export interface UserStatusDialogProps {
  /** The person to disable or enable, or `null` while the dialog is closed. */
  readonly user: ManagedUser | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The change is committed: refresh the list. */
  readonly onChanged: () => void;
}

/** Confirms disabling or enabling an account. A disabled person cannot sign in, and an existing session is rejected. */
export function UserStatusDialog({
  user,
  open,
  onOpenChange,
  onChanged,
}: UserStatusDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  const disabling = user !== null && user.disabledAt === null;

  async function handleConfirm(): Promise<void> {
    if (!user) return;
    setSubmitting(true);
    setFailed(false);
    try {
      const client = new UsersClient(api);
      if (disabling) await client.disable(user.id);
      else await client.enable(user.id);
    } catch {
      setFailed(true);
      return;
    } finally {
      setSubmitting(false);
    }
    toaster.show({
      type: 'success',
      title: disabling
        ? t('staff.status.disable.success')
        : t('staff.status.enable.success'),
    });
    onChanged();
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <AlertDialogContent size='sm'>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {disabling
              ? t('staff.status.disable.title')
              : t('staff.status.enable.title')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {disabling
              ? t('staff.status.disable.description', {
                  name: user?.name ?? '',
                })
              : t('staff.status.enable.description', {
                  name: user?.name ?? '',
                })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failed ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {t('materials.error.requestFailed')}
            </AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          <Button
            variant={disabling ? 'destructive' : 'default'}
            disabled={submitting}
            onClick={() => void handleConfirm()}
          >
            {submitting ? <Spinner data-icon='inline-start' /> : null}
            {submitting
              ? t('staff.status.saving')
              : disabling
                ? t('staff.status.disable.action')
                : t('staff.status.enable.action')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
