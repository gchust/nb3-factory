import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import {
  API_KEY_EXPIRY_CHOICES,
  expiryChoiceToSeconds,
  type ApiKeyExpiryChoice,
} from '@nocobase/app-plugin-api-keys/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  CopyIcon,
  CheckIcon,
  LoaderCircleIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

import {
  createIntegrationKey,
  fetchIntegrationKeyTargets,
  fetchIntegrationKeys,
  revokeIntegrationKey,
  type IntegrationKey,
  type IntegrationKeyTarget,
} from '../api.js';
import { formatDateTime } from '../format.js';

/** The sentinel value for "the signed-in user" in the account selector. */
const SELF = '__self__';

/**
 * API key management, in the Settings entry the API Keys plugin registers.
 *
 * Better Auth's self-service endpoints act only on the caller's keys, so the
 * plugin's own page cannot issue a key to another account. This page keeps the
 * self-service list and adds a trusted administrator path: a supervisor picks
 * the device-platform integration account and the key is created through the
 * application's authorized server route. The secret is shown once, on creation;
 * the list only ever shows the recognizable prefix.
 */
export default function ApiKeysPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [targets, setTargets] = useState<IntegrationKeyTarget[]>([]);
  const [selected, setSelected] = useState<string>(SELF);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<{
    key: string;
    keys?: IntegrationKey[];
    error?: string;
  }>();
  const [actionError, setActionError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<IntegrationKey>();
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ name: string; secret: string }>();

  const targetId = selected === SELF ? undefined : selected;
  const requestKey = `${selected}:${reload}`;

  useEffect(() => {
    const controller = new AbortController();
    fetchIntegrationKeys(api, selected === SELF ? undefined : selected).then(
      (list) => {
        if (!controller.signal.aborted) {
          setState({ key: `${selected}:${reload}`, keys: list });
        }
      },
      (reason: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            key: `${selected}:${reload}`,
            error: readError(reason, t('service.apiKeys.errors.loadFailed')),
          });
        }
      },
    );
    return () => controller.abort();
  }, [api, selected, reload, t]);

  const loading = state?.key !== requestKey;
  const keys = state?.keys ?? [];
  const loadError = state?.error;

  useEffect(() => {
    // A supervisor may choose the account; everyone else only sees their own
    // keys. A refusal is not an error: it just means the selector stays hidden.
    void fetchIntegrationKeyTargets(api).then(
      (list) => setTargets(list),
      () => setTargets([]),
    );
  }, [api]);

  const create = async (name: string, expiry: ApiKeyExpiryChoice) => {
    setBusy(true);
    setActionError(undefined);
    try {
      const { secret } = await createIntegrationKey(api, {
        ...(targetId ? { userId: targetId } : {}),
        name,
        expiresIn: expiryChoiceToSeconds(expiry) ?? null,
      });
      setCreating(false);
      setIssued({ name, secret });
      setReload((count) => count + 1);
    } catch (reason) {
      setActionError(
        readError(reason, t('service.apiKeys.errors.createFailed')),
      );
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (key: IntegrationKey) => {
    setBusy(true);
    setActionError(undefined);
    try {
      await revokeIntegrationKey(api, key.id);
      setRevoking(undefined);
      toaster.show({ type: 'success', title: t('service.apiKeys.revoked') });
      setReload((count) => count + 1);
    } catch (reason) {
      setActionError(
        readError(reason, t('service.apiKeys.errors.revokeFailed')),
      );
    } finally {
      setBusy(false);
    }
  };

  const selectedName =
    selected === SELF
      ? t('service.apiKeys.self')
      : (targets.find((item) => item.id === selected)?.name ?? selected);

  const accountItems = [
    { value: SELF, label: t('service.apiKeys.self') },
    ...targets.map((target) => ({
      value: target.id,
      label: `${target.name}${target.username ? ` (${target.username})` : ''}`,
    })),
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('service.apiKeys.title')}
        description={t('service.apiKeys.description')}
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon /> {t('service.apiKeys.add')}
          </Button>
        }
      />

      {targets.length > 0 ? (
        <div className='flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4'>
          <div className='space-y-1.5'>
            <Label htmlFor='api-key-account'>
              {t('service.apiKeys.account')}
            </Label>
            <Select
              items={accountItems}
              value={selected}
              onValueChange={(value) => setSelected(value ?? SELF)}
            >
              <SelectTrigger id='api-key-account' className='w-72'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELF}>
                  {t('service.apiKeys.self')}
                </SelectItem>
                {targets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.name}
                    {target.username ? ` (${target.username})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className='text-xs leading-5 text-muted-foreground'>
            {t('service.apiKeys.accountHint', { name: selectedName })}
          </p>
        </div>
      ) : null}

      {(actionError ?? loadError) ? (
        <div className='rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive'>
          {actionError ?? loadError}
        </div>
      ) : null}

      <div className='overflow-hidden rounded-xl border bg-card'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('service.apiKeys.columns.name')}</TableHead>
              <TableHead>{t('service.apiKeys.columns.key')}</TableHead>
              <TableHead>{t('service.apiKeys.columns.status')}</TableHead>
              <TableHead>{t('service.apiKeys.columns.lastUsed')}</TableHead>
              <TableHead>{t('service.apiKeys.columns.expires')}</TableHead>
              <TableHead className='w-14'>
                <span className='sr-only'>
                  {t('service.apiKeys.columns.actions')}
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className='h-32 text-center text-muted-foreground'
                >
                  <LoaderCircleIcon className='mx-auto size-5 animate-spin' />
                </TableCell>
              </TableRow>
            ) : keys.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className='h-32 text-center text-muted-foreground'
                >
                  {t('service.apiKeys.empty')}
                </TableCell>
              </TableRow>
            ) : (
              keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className='font-medium'>
                    {key.name || t('service.apiKeys.unnamed')}
                  </TableCell>
                  <TableCell className='font-mono text-xs text-muted-foreground'>
                    {key.hint}
                  </TableCell>
                  <TableCell>
                    <Badge variant={key.enabled ? 'default' : 'secondary'}>
                      {key.enabled
                        ? t('service.apiKeys.active')
                        : t('service.apiKeys.disabled')}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-sm text-muted-foreground'>
                    {key.lastRequest
                      ? formatDateTime(key.lastRequest)
                      : t('service.apiKeys.unused')}
                  </TableCell>
                  <TableCell className='text-sm text-muted-foreground'>
                    {key.expiresAt
                      ? formatDateTime(key.expiresAt)
                      : t('service.apiKeys.never')}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      aria-label={t('service.apiKeys.revoke')}
                      onClick={() => setRevoking(key)}
                    >
                      <Trash2Icon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CreateKeyDialog
        open={creating}
        busy={busy}
        onOpenChange={setCreating}
        onSubmit={create}
      />

      <RevealKeyDialog issued={issued} onClose={() => setIssued(undefined)} />

      <RevokeKeyDialog
        target={revoking}
        busy={busy}
        onCancel={() => setRevoking(undefined)}
        onConfirm={revoke}
      />
    </PageContainer>
  );
}

function CreateKeyDialog({
  open,
  busy,
  onOpenChange,
  onSubmit,
}: {
  readonly open: boolean;
  readonly busy: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (
    name: string,
    expiry: ApiKeyExpiryChoice,
  ) => Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState<ApiKeyExpiryChoice>('90');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setName('');
          setExpiry('90');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit(name.trim(), expiry);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('service.apiKeys.form.title')}</DialogTitle>
            <DialogDescription>
              {t('service.apiKeys.form.description')}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-2'>
            <Label htmlFor='integration-key-name'>
              {t('service.apiKeys.form.name')}
            </Label>
            <Input
              id='integration-key-name'
              value={name}
              required
              maxLength={32}
              placeholder={t('service.apiKeys.form.namePlaceholder')}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='integration-key-expiry'>
              {t('service.apiKeys.form.expiry')}
            </Label>
            <Select
              items={API_KEY_EXPIRY_CHOICES.map((choice) => ({
                value: choice,
                label: t(`service.apiKeys.form.expiryChoices.${choice}`),
              }))}
              value={expiry}
              onValueChange={(value) => setExpiry(value ?? 'never')}
            >
              <SelectTrigger id='integration-key-expiry' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {API_KEY_EXPIRY_CHOICES.map((choice) => (
                  <SelectItem key={choice} value={choice}>
                    {t(`service.apiKeys.form.expiryChoices.${choice}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('service.apiKeys.form.cancel')}
            </Button>
            <Button type='submit' disabled={busy || name.trim().length === 0}>
              {busy ? <LoaderCircleIcon className='animate-spin' /> : null}
              {t('service.apiKeys.form.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RevealKeyDialog({
  issued,
  onClose,
}: {
  readonly issued?: { name: string; secret: string };
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <Dialog
      open={issued !== undefined}
      onOpenChange={(next) => {
        if (!next) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('service.apiKeys.reveal.title')}</DialogTitle>
          <DialogDescription>
            {t('service.apiKeys.reveal.description', {
              name: issued?.name ?? '',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className='mt-4 flex items-center gap-2 rounded-lg border bg-muted/40 p-3'>
          <code className='flex-1 font-mono text-xs break-all'>
            {issued?.secret}
          </code>
          <Button
            variant='outline'
            size='icon-sm'
            aria-label={t('service.apiKeys.reveal.copy')}
            onClick={() => {
              if (!issued) return;
              void navigator.clipboard
                .writeText(issued.secret)
                .then(() => setCopied(true));
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </Button>
        </div>
        <p className='mt-3 text-sm text-muted-foreground'>
          {t('service.apiKeys.reveal.usage')}
        </p>
        <DialogFooter>
          <Button onClick={onClose}>{t('service.apiKeys.reveal.done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeKeyDialog({
  target,
  busy,
  onCancel,
  onConfirm,
}: {
  readonly target?: IntegrationKey;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: (key: IntegrationKey) => Promise<void>;
}): ReactElement {
  const { t } = useTranslation();

  return (
    <Dialog
      open={target !== undefined}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('service.apiKeys.revokeTitle')}</DialogTitle>
          <DialogDescription>
            {t('service.apiKeys.revokeDescription', {
              name: target?.name || t('service.apiKeys.unnamed'),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant='outline' onClick={onCancel}>
            {t('service.apiKeys.form.cancel')}
          </Button>
          <Button
            variant='destructive'
            disabled={busy}
            onClick={() => {
              if (target) void onConfirm(target);
            }}
          >
            {busy ? <LoaderCircleIcon className='animate-spin' /> : null}
            {t('service.apiKeys.revoke')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function readError(value: unknown, fallback: string): string {
  if (value instanceof ApiClientError && value.message) {
    return value.message;
  }
  if (value instanceof Error && value.message) {
    return value.message;
  }
  return fallback;
}
