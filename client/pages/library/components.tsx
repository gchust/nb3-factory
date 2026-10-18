import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Spinner } from '#components/ui/spinner';
import { StatusBadge } from '#components/status-badge';
import { Textarea } from '#components/ui/textarea';

import type { LibraryMaterial, LibraryMember, LibraryShare } from './api.js';
import { errorMessage } from './api.js';
import { useLibraryClient } from './use-library.js';

/** The state of a material at a glance: its publication, its confidentiality, and whether it was shared with you. */
export function MaterialBadges({
  material,
}: {
  readonly material: LibraryMaterial;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      {material.published ? (
        <StatusBadge tone='success'>
          {t('library.status.published')}
        </StatusBadge>
      ) : (
        <StatusBadge tone='warning'>{t('library.status.draft')}</StatusBadge>
      )}
      {material.confidential ? (
        <StatusBadge tone='warning'>
          {t('library.status.confidential')}
        </StatusBadge>
      ) : null}
      {material.shared ? (
        <StatusBadge tone='info'>{t('library.status.shared')}</StatusBadge>
      ) : null}
    </div>
  );
}

/** A two-option segmented control, used for the material's two flags so no extra primitive is needed. */
function Toggle({
  value,
  onChange,
  options,
}: {
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly options: readonly [string, string];
}): ReactElement {
  return (
    <div className='flex items-center gap-1 rounded-lg border border-border p-0.5'>
      <Button
        type='button'
        size='sm'
        variant={value ? 'default' : 'ghost'}
        aria-pressed={value}
        onClick={() => onChange(true)}
      >
        {options[0]}
      </Button>
      <Button
        type='button'
        size='sm'
        variant={value ? 'ghost' : 'default'}
        aria-pressed={!value}
        onClick={() => onChange(false)}
      >
        {options[1]}
      </Button>
    </div>
  );
}

export interface MaterialFormDialogProps {
  /** The material being edited, or `null` to create a new one. */
  readonly material: LibraryMaterial | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
}

/**
 * Create or edit a material. The dialog is mounted only while it is open, so it starts each opening from the material it
 * edits rather than from the previous dialog's half-typed values; no reset effect is needed.
 */
export function MaterialFormDialog({
  material,
  onOpenChange,
  onSaved,
}: MaterialFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const client = useLibraryClient();
  const [title, setTitle] = useState(material?.title ?? '');
  const [body, setBody] = useState(material?.body ?? '');
  const [published, setPublished] = useState(material?.published ?? false);
  const [confidential, setConfidential] = useState(
    material?.confidential ?? false,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    const trimmed = title.trim();
    if (trimmed === '') {
      setError(t('library.form.titleRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = {
        title: trimmed,
        body: body === '' ? null : body,
        published,
        confidential,
      };
      if (material) await client.updateMaterial(material.id, input);
      else await client.createMaterial(input);
      onOpenChange(false);
      onSaved();
    } catch (cause) {
      setError(`${t('library.saveFailed')} ${errorMessage(cause)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {material
              ? t('library.form.editTitle')
              : t('library.form.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('library.form.description')}</DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='material-title'>{t('library.form.title')}</Label>
            <Input
              id='material-title'
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('library.form.titlePlaceholder')}
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='material-body'>{t('library.form.body')}</Label>
            <Textarea
              id='material-body'
              rows={8}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t('library.form.bodyPlaceholder')}
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label>{t('library.form.visibility')}</Label>
            <Toggle
              value={published}
              onChange={setPublished}
              options={[t('library.form.published'), t('library.form.draft')]}
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label>{t('library.form.confidentiality')}</Label>
            <Toggle
              value={confidential}
              onChange={setConfidential}
              options={[
                t('library.form.confidential'),
                t('library.form.normal'),
              ]}
            />
          </div>
          {error ? (
            <Alert variant='destructive'>
              <AlertTitle>{t('library.saveFailed')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('library.form.cancel')}
          </Button>
          <Button type='button' disabled={saving} onClick={() => void save()}>
            {saving ? <Spinner data-icon='inline-start' /> : null}
            {saving ? t('library.form.saving') : t('library.form.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface ShareDialogProps {
  readonly open: boolean;
  readonly material: LibraryMaterial;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged?: () => void;
}

/**
 * The administrator's temporary-share panel. It lists every person and whether the material is shared with them, so
 * granting and revoking are both one click. Confidentiality is decided by the server and is not affected here.
 */
export function ShareDialog({
  open,
  material,
  onOpenChange,
  onChanged,
}: ShareDialogProps): ReactElement {
  const { t } = useTranslation();
  const client = useLibraryClient();
  const [members, setMembers] = useState<LibraryMember[]>();
  const [shares, setShares] = useState<LibraryShare[]>();
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([client.members(), client.shares(material.id)])
      .then(([nextMembers, nextShares]) => {
        if (cancelled) return;
        setMembers(nextMembers);
        setShares(nextShares);
        setError(null);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [open, client, material.id]);

  const toggle = async (member: LibraryMember): Promise<void> => {
    const shared = (shares ?? []).some(
      (share) => share.userId === member.userId,
    );
    setBusyUserId(member.userId);
    setError(null);
    try {
      const next = shared
        ? await client.unshare(material.id, member.userId)
        : await client.share(material.id, member.userId);
      setShares(next);
      onChanged?.();
    } catch (cause) {
      setError(`${t('library.share.failed')} ${errorMessage(cause)}`);
    } finally {
      setBusyUserId(null);
    }
  };

  const sharedIds = new Set((shares ?? []).map((share) => share.userId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{t('library.share.title')}</DialogTitle>
          <DialogDescription>
            {t('library.share.description')}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('library.share.failed')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {members === undefined ? (
          <div className='flex justify-center py-6'>
            <Spinner />
          </div>
        ) : members.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('library.share.empty')}
          </p>
        ) : (
          <ul className='flex flex-col divide-y divide-border'>
            {members.map((member) => {
              const shared = sharedIds.has(member.userId);
              return (
                <li
                  key={member.userId}
                  className='flex items-center justify-between gap-3 py-2'
                >
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-medium'>
                      {member.name || member.email}
                    </p>
                    <p className='truncate text-xs text-muted-foreground'>
                      {member.email}
                    </p>
                  </div>
                  <Button
                    type='button'
                    size='sm'
                    variant={shared ? 'outline' : 'default'}
                    disabled={busyUserId === member.userId}
                    onClick={() => void toggle(member)}
                  >
                    {shared
                      ? t('library.share.revoke')
                      : t('library.share.grant')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('library.share.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
