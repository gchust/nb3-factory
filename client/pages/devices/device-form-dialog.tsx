import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, useState, type ReactElement } from 'react';

import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Field, FieldError, FieldLabel } from '#components/ui/field';
import { Input } from '#components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Textarea } from '#components/ui/textarea';

import {
  DEVICE_STATUSES,
  DeviceClient,
  type Device,
  type DeviceStatus,
} from './device-client.js';
import { errorMessage } from './error-message.js';

interface Draft {
  code: string;
  name: string;
  status: DeviceStatus;
  notes: string;
}

const initialDraft = (device: Device | null): Draft => ({
  code: device?.code ?? '',
  name: device?.name ?? '',
  status: device?.status ?? 'available',
  notes: device?.notes ?? '',
});

/**
 * The create and edit form. It is remounted by its parent each time it opens, so a fresh draft needs no reset effect
 * and a half-typed edit never leaks into the next dialog.
 */
export function DeviceFormDialog({
  open,
  device,
  onOpenChange,
  onSaved,
}: {
  readonly open: boolean;
  readonly device: Device | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: (device: Device, created: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const client = useMemo(() => new DeviceClient(api), [api]);
  const creating = device === null;
  const [draft, setDraft] = useState<Draft>(() => initialDraft(device));
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>();

  const fieldError = (name: 'code' | 'name'): string | undefined => {
    if (serverErrors[name]) return serverErrors[name];
    if (!submitted) return;
    if (!draft[name].trim())
      return t(
        name === 'code'
          ? 'devices.form.codeRequired'
          : 'devices.form.nameRequired',
      );
    return;
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setServerErrors({});
    if (!draft.code.trim() || !draft.name.trim()) return;
    setBusy(true);
    setError(undefined);
    const input = {
      code: draft.code.trim(),
      name: draft.name.trim(),
      status: draft.status,
      notes: draft.notes.trim() ? draft.notes.trim() : null,
    };
    try {
      const saved = creating
        ? await client.create(input)
        : await client.update(device.id, input);
      toaster.show({
        type: 'success',
        title: t(creating ? 'devices.created' : 'devices.saved', {
          name: saved.name,
        }),
      });
      onOpenChange(false);
      onSaved(saved, creating);
    } catch (next) {
      if (next instanceof ApiClientError && next.reason === 'DEVICE_CODE_TAKEN')
        setServerErrors({ code: t('devices.errors.codeTaken') });
      else setError(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(creating ? 'devices.create.title' : 'devices.edit.title')}
          </DialogTitle>
          <DialogDescription>
            {t(
              creating
                ? 'devices.create.description'
                : 'devices.edit.description',
            )}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant='destructive'>
            <AlertDescription>{errorMessage(t, error)}</AlertDescription>
          </Alert>
        ) : null}
        <form
          id='device-form'
          noValidate
          className='flex flex-col gap-4'
          onSubmit={(event) => void submit(event)}
        >
          <Field data-invalid={Boolean(fieldError('code')) || undefined}>
            <FieldLabel htmlFor='device-code'>
              {t('devices.fields.code')}
            </FieldLabel>
            <Input
              id='device-code'
              name='code'
              value={draft.code}
              autoComplete='off'
              placeholder={t('devices.form.codePlaceholder')}
              aria-invalid={Boolean(fieldError('code')) || undefined}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  code: event.target.value,
                }))
              }
            />
            <FieldError>{fieldError('code')}</FieldError>
          </Field>
          <Field data-invalid={Boolean(fieldError('name')) || undefined}>
            <FieldLabel htmlFor='device-name'>
              {t('devices.fields.name')}
            </FieldLabel>
            <Input
              id='device-name'
              name='name'
              value={draft.name}
              autoComplete='off'
              placeholder={t('devices.form.namePlaceholder')}
              aria-invalid={Boolean(fieldError('name')) || undefined}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
            <FieldError>{fieldError('name')}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor='device-status'>
              {t('devices.fields.status')}
            </FieldLabel>
            <Select
              items={DEVICE_STATUSES.map((value) => ({
                value,
                label: t(`devices.status.${value}`),
              }))}
              value={draft.status}
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  status: value as DeviceStatus,
                }))
              }
            >
              <SelectTrigger
                id='device-status'
                aria-label={t('devices.fields.status')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEVICE_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`devices.status.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor='device-notes'>
              {t('devices.fields.notes')}
            </FieldLabel>
            <Textarea
              id='device-notes'
              name='notes'
              value={draft.notes}
              placeholder={t('devices.form.notesPlaceholder')}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </Field>
        </form>
        <DialogFooter>
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t('devices.actions.cancel')}
          </Button>
          <Button form='device-form' type='submit' disabled={busy}>
            {t(busy ? 'devices.actions.saving' : 'devices.actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
