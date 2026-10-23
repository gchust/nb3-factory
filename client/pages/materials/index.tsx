import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Badge } from '#components/ui/badge';
import { Empty, EmptyDescription, EmptyTitle } from '#components/ui/empty';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Switch } from '#components/ui/switch';
import { Textarea } from '#components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  LockIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';

import {
  MaterialsClient,
  type Material,
  type MaterialInput,
  type MaterialShare,
  type MaterialsCapabilities,
  type ShareTarget,
} from './client.js';

interface MaterialsState {
  readonly capabilities?: MaterialsCapabilities;
  readonly materials: readonly Material[];
  readonly loading: boolean;
  readonly error?: unknown;
}

function useMaterials(): MaterialsState & {
  readonly client: MaterialsClient;
  readonly reload: () => void;
} {
  const api = useApiClient();
  const client = useMemo(() => new MaterialsClient(api), [api]);
  const [state, setState] = useState<MaterialsState>({
    materials: [],
    loading: true,
  });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([client.capabilities(), client.list()]).then(
      ([capabilities, materials]) => {
        if (active) setState({ capabilities, materials, loading: false });
      },
      (error: unknown) => {
        if (active) setState({ materials: [], loading: false, error });
      },
    );
    return () => {
      active = false;
    };
  }, [client, revision]);

  return {
    ...state,
    client,
    reload: useCallback(() => setRevision((value) => value + 1), []),
  };
}

const errorText = (t: (key: string) => string, error: unknown): string =>
  error instanceof ApiClientError && error.status === 403
    ? t('materials.denied')
    : t('materials.failed');

/** The create/edit form. `material` absent means a new material. */
function MaterialForm({
  material,
  onClose,
  onSaved,
}: {
  readonly material?: Material;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const client = useMemo(() => new MaterialsClient(api), [api]);
  const [title, setTitle] = useState(material?.title ?? '');
  const [body, setBody] = useState(material?.body ?? '');
  const [published, setPublished] = useState(material?.published ?? false);
  const [confidential, setConfidential] = useState(
    material?.confidential ?? false,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setError(undefined);
    const input: MaterialInput = {
      title: title.trim(),
      body: body.trim() ? body : null,
      published,
      confidential,
    };
    try {
      if (material) await client.update(material.id, input);
      else await client.create(input);
      toaster.show({ type: 'success', title: t('materials.saved') });
      onSaved();
      onClose();
    } catch (next) {
      setError(errorText(t, next));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid='material-form'>
        <DialogHeader>
          <DialogTitle>
            {material ? t('materials.editTitle') : t('materials.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('materials.formDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <div className='grid gap-2'>
            <Label htmlFor='material-title'>{t('materials.title')}</Label>
            <Input
              id='material-title'
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='material-body'>{t('materials.body')}</Label>
            <Textarea
              id='material-body'
              rows={6}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          <label className='flex items-center justify-between gap-4 text-sm'>
            <span>{t('materials.published')}</span>
            <Switch checked={published} onCheckedChange={setPublished} />
          </label>
          <label className='flex items-center justify-between gap-4 text-sm'>
            <span>{t('materials.confidential')}</span>
            <Switch checked={confidential} onCheckedChange={setConfidential} />
          </label>
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('materials.cancel')}
          </Button>
          <Button
            disabled={busy || !title.trim()}
            onClick={() => void submit()}
          >
            {t('materials.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The per-record share panel: who may read a material besides its owner. */
function SharePanel({
  material,
  onChanged,
}: {
  readonly material: Material;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const client = useMemo(() => new MaterialsClient(api), [api]);
  const [shares, setShares] = useState<readonly MaterialShare[]>([]);
  const [targets, setTargets] = useState<readonly ShareTarget[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string>();

  const load = useCallback(() => {
    void Promise.all([
      client.listShares(material.id),
      client.shareTargets(material.id),
    ]).then(
      ([nextShares, nextTargets]) => {
        setShares(nextShares);
        setTargets(nextTargets);
        setSelected((current) =>
          nextTargets.some((target) => target.id === current)
            ? current
            : (nextTargets[0]?.id ?? ''),
        );
      },
      (next: unknown) => setError(errorText(t, next)),
    );
  }, [client, material.id, t]);

  useEffect(load, [load]);

  const grant = async () => {
    if (!selected) return;
    try {
      await client.share(material.id, selected);
      toaster.show({ type: 'success', title: t('materials.shareGranted') });
      load();
      onChanged();
    } catch (next) {
      setError(errorText(t, next));
    }
  };

  const revoke = async (userId: string) => {
    try {
      await client.revokeShare(material.id, userId);
      toaster.show({ type: 'success', title: t('materials.shareRevoked') });
      load();
      onChanged();
    } catch (next) {
      setError(errorText(t, next));
    }
  };

  return (
    <section className='grid gap-3' data-testid='material-shares'>
      <div className='flex items-center gap-2'>
        <UsersIcon className='size-4 text-muted-foreground' />
        <h3 className='text-sm font-medium'>{t('materials.shares')}</h3>
      </div>
      <p className='text-sm text-muted-foreground'>
        {material.confidential
          ? t('materials.confidentialShareHint')
          : t('materials.shareHint')}
      </p>
      {shares.length ? (
        <ul className='grid gap-2'>
          {shares.map((share) => (
            <li
              key={share.userId}
              className='flex items-center justify-between gap-4 rounded-lg border p-2 text-sm'
            >
              <span>
                {share.name}
                <span className='ml-2 text-muted-foreground'>
                  {share.email}
                </span>
              </span>
              <Button
                variant='ghost'
                size='sm'
                data-testid='material-share-revoke'
                onClick={() => void revoke(share.userId)}
              >
                {t('materials.revoke')}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-sm text-muted-foreground'>
          {t('materials.noShares')}
        </p>
      )}
      <div className='flex items-center gap-2'>
        <select
          className='h-9 min-w-0 flex-1 rounded-md border bg-transparent px-3 text-sm'
          aria-label={t('materials.shareTarget')}
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          {targets.length === 0 ? (
            <option value=''>{t('materials.noTargets')}</option>
          ) : (
            targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name} · {target.email}
              </option>
            ))
          )}
        </select>
        <Button
          data-testid='material-share-grant'
          disabled={!selected}
          onClick={() => void grant()}
        >
          {t('materials.grant')}
        </Button>
      </div>
      {error ? <p className='text-sm text-destructive'>{error}</p> : null}
    </section>
  );
}

/** The read view of one material, with its owner, flags, body and share panel. */
function MaterialDetail({
  material,
  capabilities,
  onClose,
  onEdit,
  onChanged,
}: {
  readonly material: Material;
  readonly capabilities?: MaterialsCapabilities;
  readonly onClose: () => void;
  readonly onEdit: () => void;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className='max-h-[85vh] overflow-y-auto sm:max-w-2xl'
        data-testid='material-detail'
      >
        <DialogHeader>
          <DialogTitle>{material.title}</DialogTitle>
          <DialogDescription>
            {t('materials.owner')}: {material.ownerName ?? material.ownerId}
          </DialogDescription>
        </DialogHeader>
        <div className='flex flex-wrap gap-2'>
          <Badge variant={material.published ? 'default' : 'secondary'}>
            {material.published
              ? t('materials.published')
              : t('materials.draft')}
          </Badge>
          {material.confidential ? (
            <Badge variant='destructive'>
              <LockIcon />
              {t('materials.confidential')}
            </Badge>
          ) : null}
        </div>
        <div className='whitespace-pre-wrap text-sm leading-6'>
          {material.body || t('materials.noBody')}
        </div>
        {capabilities?.share ? (
          <SharePanel material={material} onChanged={onChanged} />
        ) : null}
        <DialogFooter>
          {capabilities?.edit ? (
            <Button variant='outline' onClick={onEdit}>
              <PencilIcon />
              {t('materials.edit')}
            </Button>
          ) : null}
          <Button onClick={onClose}>{t('materials.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Route `/materials`: the internal materials library. */
export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const { capabilities, materials, loading, error, client, reload } =
    useMaterials();
  const toaster = useToaster();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Material>();
  const [viewingId, setViewingId] = useState<string>();
  const [removing, setRemoving] = useState<Material>();

  const viewing = materials.find((material) => material.id === viewingId);

  const remove = async () => {
    if (!removing) return;
    try {
      await client.remove(removing.id);
      toaster.show({ type: 'success', title: t('materials.deleted') });
      setRemoving(undefined);
      setViewingId(undefined);
      reload();
    } catch (next) {
      toaster.show({ type: 'error', title: errorText(t, next) });
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.pageTitle')}
        description={t('materials.pageDescription')}
        actions={
          capabilities?.create ? (
            <Button
              data-testid='material-create'
              onClick={() => setCreating(true)}
            >
              <PlusIcon />
              {t('materials.create')}
            </Button>
          ) : null
        }
      />
      {error ? (
        <p className='text-sm text-destructive'>{errorText(t, error)}</p>
      ) : null}
      {loading ? (
        <p className='text-sm text-muted-foreground'>
          {t('materials.loading')}
        </p>
      ) : materials.length === 0 ? (
        <Empty>
          <EmptyTitle>{t('materials.emptyTitle')}</EmptyTitle>
          <EmptyDescription>{t('materials.emptyDescription')}</EmptyDescription>
        </Empty>
      ) : (
        <Table data-testid='materials-table'>
          <TableHeader>
            <TableRow>
              <TableHead>{t('materials.title')}</TableHead>
              <TableHead>{t('materials.owner')}</TableHead>
              <TableHead>{t('materials.status')}</TableHead>
              <TableHead className='text-right'>
                {t('materials.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {materials.map((material) => (
              <TableRow
                key={material.id}
                data-testid={`material-row-${material.id}`}
              >
                <TableCell className='font-medium'>
                  <button
                    type='button'
                    className='text-left hover:underline'
                    onClick={() => setViewingId(material.id)}
                  >
                    {material.title}
                  </button>
                </TableCell>
                <TableCell>{material.ownerName ?? material.ownerId}</TableCell>
                <TableCell>
                  <div className='flex flex-wrap gap-2'>
                    <Badge
                      variant={material.published ? 'default' : 'secondary'}
                    >
                      {material.published
                        ? t('materials.published')
                        : t('materials.draft')}
                    </Badge>
                    {material.confidential ? (
                      <Badge variant='destructive'>
                        <LockIcon />
                        {t('materials.confidential')}
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className='text-right'>
                  <div className='flex justify-end gap-2'>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => setViewingId(material.id)}
                    >
                      {t('materials.view')}
                    </Button>
                    {capabilities?.edit ? (
                      <Button
                        variant='ghost'
                        size='sm'
                        data-testid={`material-edit-${material.id}`}
                        onClick={() => setEditing(material)}
                      >
                        <PencilIcon />
                      </Button>
                    ) : null}
                    {capabilities?.delete ? (
                      <Button
                        variant='ghost'
                        size='sm'
                        data-testid={`material-delete-${material.id}`}
                        onClick={() => setRemoving(material)}
                      >
                        <TrashIcon />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {creating ? (
        <MaterialForm onClose={() => setCreating(false)} onSaved={reload} />
      ) : null}
      {editing ? (
        <MaterialForm
          material={editing}
          onClose={() => setEditing(undefined)}
          onSaved={reload}
        />
      ) : null}
      {viewing ? (
        <MaterialDetail
          material={viewing}
          capabilities={capabilities}
          onClose={() => setViewingId(undefined)}
          onEdit={() => {
            setViewingId(undefined);
            setEditing(viewing);
          }}
          onChanged={reload}
        />
      ) : null}
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('materials.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('materials.deleteDescription', {
                title: removing?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('materials.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>
              {t('materials.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
