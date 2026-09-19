import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Loading } from '@/components/loading';
import {
  createEquipment,
  deleteEquipment,
  fileContentUrl,
  getSessionContext,
  listEquipment,
  removeEquipmentPhoto,
  updateEquipment,
  uploadEquipmentPhoto,
  useAsync,
} from '@/components/inspection/api.js';
import {
  EQUIPMENT_STATUSES,
  equipmentStatusKey,
  formatDate,
} from '@/components/inspection/format.js';
import { EquipmentStatusBadge } from '@/components/inspection/status-badge.js';
import type { Equipment } from '@/components/inspection/types.js';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

export default function EquipmentPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const equipment = useAsync('equipment', listEquipment);
  const session = useAsync('session', getSessionContext);
  const isManager = isManagerRole(session.data?.roles);
  const [editor, setEditor] = useState<Equipment | 'new' | undefined>();
  const [error, setError] = useState('');

  async function handleDelete(item: Equipment): Promise<void> {
    setError('');
    if (!window.confirm(t('equipment.confirmDelete', { code: item.code }))) {
      return;
    }
    try {
      await deleteEquipment(api, item.id);
      equipment.reload();
    } catch (cause) {
      setError(messageOf(cause, t('equipment.saveFailed')));
    }
  }

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('equipment.title')}
        description={t('equipment.description')}
        actions={
          isManager ? (
            <Button onClick={() => setEditor('new')}>
              <Plus className='size-4' />
              {t('equipment.create')}
            </Button>
          ) : undefined
        }
      />
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
      {equipment.loading ? (
        <Loading label={t('status.loading')} />
      ) : equipment.error ? (
        <p role='alert' className='text-sm text-destructive'>
          {t('equipment.loadFailed')}
        </p>
      ) : (
        <div className='rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('equipment.photo')}</TableHead>
                <TableHead>{t('equipment.code')}</TableHead>
                <TableHead>{t('equipment.name')}</TableHead>
                <TableHead>{t('equipment.model')}</TableHead>
                <TableHead>{t('equipment.location')}</TableHead>
                <TableHead>{t('equipment.commissionedAt')}</TableHead>
                <TableHead>{t('equipment.status')}</TableHead>
                {isManager ? (
                  <TableHead>{t('equipment.actions')}</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(equipment.data ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.photoFileId ? (
                      <img
                        src={fileContentUrl(item.photoFileId)}
                        alt={item.name}
                        className='h-10 w-14 rounded object-cover'
                      />
                    ) : (
                      <span className='flex h-10 w-14 items-center justify-center rounded bg-muted text-muted-foreground'>
                        <ImagePlus className='size-4' />
                      </span>
                    )}
                  </TableCell>
                  <TableCell className='font-medium'>{item.code}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.model ?? '-'}</TableCell>
                  <TableCell>{item.location ?? '-'}</TableCell>
                  <TableCell>{formatDate(item.commissionedAt)}</TableCell>
                  <TableCell>
                    <EquipmentStatusBadge status={item.status} />
                  </TableCell>
                  {isManager ? (
                    <TableCell>
                      <span className='flex gap-1'>
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => setEditor(item)}
                        >
                          <Pencil className='size-4' />
                          {t('equipment.edit')}
                        </Button>
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => void handleDelete(item)}
                        >
                          <Trash2 className='size-4' />
                          {t('equipment.delete')}
                        </Button>
                      </span>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editor ? (
        <EquipmentEditor
          equipment={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(undefined)}
          onSaved={() => equipment.reload()}
        />
      ) : null}
    </PageContainer>
  );
}

function EquipmentEditor(props: {
  readonly equipment: Equipment | undefined;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { equipment } = props;
  const [form, setForm] = useState({
    code: equipment?.code ?? '',
    name: equipment?.name ?? '',
    model: equipment?.model ?? '',
    location: equipment?.location ?? '',
    commissionedAt: equipment?.commissionedAt
      ? equipment.commissionedAt.slice(0, 10)
      : '',
    status: equipment?.status ?? 'running',
    remark: equipment?.remark ?? '',
  });
  const [current, setCurrent] = useState(equipment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  // Base UI's Select.Value resolves the trigger label from `items`, so the
  // status shows its translated name instead of the raw code.
  const statusItems = EQUIPMENT_STATUSES.map((status) => ({
    value: status,
    label: t(equipmentStatusKey(status)),
  }));

  function update(key: keyof typeof form, value: string): void {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      if (current) {
        setCurrent(await updateEquipment(api, current.id, { ...form }));
      } else {
        const created = await createEquipment(api, { ...form });
        setCurrent(created);
        props.onSaved();
        props.onClose();
        return;
      }
      props.onSaved();
    } catch (cause) {
      setError(messageOf(cause, t('equipment.saveFailed')));
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File): Promise<void> {
    if (!current) return;
    setBusy(true);
    setError('');
    try {
      setCurrent(await uploadEquipmentPhoto(api, current.id, file));
      props.onSaved();
    } catch (cause) {
      setError(messageOf(cause, t('equipment.photoFailed')));
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(): Promise<void> {
    if (!current) return;
    setBusy(true);
    setError('');
    try {
      setCurrent(await removeEquipmentPhoto(api, current.id));
      props.onSaved();
    } catch (cause) {
      setError(messageOf(cause, t('equipment.photoFailed')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      // The native date input's calendar popup lives outside the dialog DOM, so
      // Base UI treats picking a date as an outside press and dismisses the
      // dialog, discarding the form. Keep pointer dismissal off; Cancel and
      // Escape still close the dialog.
      disablePointerDismissal
      onOpenChange={(open) => !open && props.onClose()}
    >
      <DialogContent className='max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {current ? t('equipment.editTitle') : t('equipment.createTitle')}
          </DialogTitle>
        </DialogHeader>
        <div className='grid gap-3 sm:grid-cols-2'>
          <Field label={t('equipment.code')}>
            <Input
              value={form.code}
              onChange={(event) => update('code', event.target.value)}
            />
          </Field>
          <Field label={t('equipment.name')}>
            <Input
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
            />
          </Field>
          <Field label={t('equipment.model')}>
            <Input
              value={form.model}
              onChange={(event) => update('model', event.target.value)}
            />
          </Field>
          <Field label={t('equipment.location')}>
            <Input
              value={form.location}
              onChange={(event) => update('location', event.target.value)}
            />
          </Field>
          <Field label={t('equipment.commissionedAt')}>
            <Input
              type='date'
              value={form.commissionedAt}
              onChange={(event) => update('commissionedAt', event.target.value)}
            />
          </Field>
          <Field label={t('equipment.status')}>
            <Select
              items={statusItems}
              value={form.status}
              onValueChange={(value) => update('status', value ?? '')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EQUIPMENT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {t(equipmentStatusKey(status))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className='sm:col-span-2'>
            <Field label={t('equipment.remark')}>
              <Textarea
                value={form.remark}
                onChange={(event) => update('remark', event.target.value)}
              />
            </Field>
          </div>
          {current ? (
            <div className='space-y-2 sm:col-span-2'>
              <Label>{t('equipment.photo')}</Label>
              <div className='flex items-center gap-3'>
                {current.photoFileId ? (
                  <img
                    src={fileContentUrl(current.photoFileId)}
                    alt={current.name}
                    className='h-16 w-24 rounded object-cover'
                  />
                ) : (
                  <span className='flex h-16 w-24 items-center justify-center rounded bg-muted text-muted-foreground'>
                    <ImagePlus className='size-5' />
                  </span>
                )}
                <input
                  ref={photoInputRef}
                  hidden
                  type='file'
                  accept='image/*'
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadPhoto(file);
                  }}
                />
                <Button
                  type='button'
                  variant='outline'
                  disabled={busy}
                  onClick={() => photoInputRef.current?.click()}
                >
                  {t('equipment.changePhoto')}
                </Button>
                {current.photoFileId ? (
                  <Button
                    type='button'
                    variant='ghost'
                    disabled={busy}
                    onClick={() => void removePhoto()}
                  >
                    {t('equipment.removePhoto')}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={props.onClose}>
            {t('actions.cancel')}
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field(props: {
  readonly label: string;
  readonly children: ReactElement;
}): ReactElement {
  return (
    <div className='space-y-1'>
      <Label>{props.label}</Label>
      {props.children}
    </div>
  );
}

function isManagerRole(roles: readonly string[] | undefined): boolean {
  return Boolean(
    roles?.some(
      (role) => role === 'system-administrator' || role === 'equipment-manager',
    ),
  );
}

function messageOf(cause: unknown, fallback: string): string {
  const payload = cause as {
    payload?: { message?: unknown };
    message?: unknown;
  };
  if (typeof payload?.payload?.message === 'string') {
    return payload.payload.message;
  }
  if (cause instanceof Error && cause.message) return cause.message;
  return fallback;
}
