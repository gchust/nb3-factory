import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useState,
} from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

import {
  createMaterial,
  deleteMaterial,
  listMaterials,
  updateMaterial,
  type Material,
  type MaterialInput,
} from './materials-api.js';

type LoadStatus = 'loading' | 'ready' | 'error';

/** The blank form a create dialog opens with. */
const EMPTY_INPUT: MaterialInput = { body: '', title: '' };

/**
 * The record an assistant's citation linked to, read from `?id=`. It is only a
 * request to focus: the server still decides whether the record is in the
 * list, so a link to a material the user cannot read focuses nothing.
 */
function readFocusedId(): number | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = new URLSearchParams(window.location.search).get('id');
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * The materials library: the records the signed-in user may read, plus the
 * create/edit/remove controls their `manage` grant allows.
 *
 * The server is the authority. The list request decides what is visible and
 * whether the page offers editing; every write re-checks `manage`, so a
 * colleague who somehow sees the controls still cannot use them.
 */
export default function MaterialsPage(): ReactElement {
  const api = useApiClient();
  const toast = useToaster();
  const { t } = useTranslation();

  const [materials, setMaterials] = useState<readonly Material[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState<MaterialInput>(EMPTY_INPUT);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bumping this token re-runs the load effect below. Mutations call `reload`
  // rather than fetching themselves so the list is refreshed through one path.
  const [reloadToken, setReloadToken] = useState(0);

  const [focusedId] = useState(readFocusedId);

  // The fetch lives in the effect, and setState only happens in the promise
  // callbacks, so React does not treat this as a state write during the effect.
  useEffect(() => {
    let active = true;
    listMaterials(api)
      .then((result) => {
        if (!active) return;
        setMaterials(result.data);
        setCanManage(result.meta.canManage);
        setLoadError(null);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(
          error instanceof ApiClientError && error.status === 403
            ? t('materials.forbidden')
            : t('materials.loadFailed'),
        );
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [api, reloadToken, t]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const retry = useCallback(() => {
    setStatus('loading');
    setLoadError(null);
    reload();
  }, [reload]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(EMPTY_INPUT);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((material: Material) => {
    setEditing(material);
    setForm({ body: material.body, title: material.title });
    setDialogOpen(true);
  }, []);

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const input: MaterialInput = {
        body: form.body.trim(),
        title: form.title.trim(),
      };
      if (!input.title || !input.body) {
        toast.show({ title: t('materials.form.incomplete'), type: 'warning' });
        return;
      }
      setSaving(true);
      try {
        if (editing) {
          await updateMaterial(api, editing.id, input);
          toast.show({ title: t('materials.updated'), type: 'success' });
        } else {
          await createMaterial(api, input);
          toast.show({ title: t('materials.created'), type: 'success' });
        }
        setDialogOpen(false);
        reload();
      } catch {
        toast.show({ title: t('materials.actionFailed'), type: 'error' });
      } finally {
        setSaving(false);
      }
    },
    [api, editing, form, reload, t, toast],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleting(true);
    try {
      await deleteMaterial(api, deleteTarget.id);
      toast.show({ title: t('materials.deleted'), type: 'success' });
      setDeleteTarget(null);
      reload();
    } catch {
      toast.show({ title: t('materials.actionFailed'), type: 'error' });
    } finally {
      setDeleting(false);
    }
  }, [api, deleteTarget, reload, t, toast]);

  return (
    <PageContainer>
      <PageHeader
        actions={
          canManage ? (
            <Button onClick={openCreate} type='button'>
              <PlusIcon />
              {t('materials.new')}
            </Button>
          ) : null
        }
        description={t('materials.description')}
        title={t('materials.title')}
      />

      {status === 'ready' ? (
        <p className='text-sm text-muted-foreground'>
          {canManage ? t('materials.manageHint') : t('materials.readOnlyHint')}
        </p>
      ) : null}

      {status === 'loading' ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Spinner />
          {t('materials.loading')}
        </div>
      ) : null}

      {status === 'error' ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('materials.errorTitle')}</AlertTitle>
          <AlertDescription className='space-y-3'>
            <p>{loadError}</p>
            <Button onClick={retry} size='sm' variant='outline'>
              {t('status.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {status === 'ready' && materials.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('materials.emptyTitle')}</EmptyTitle>
            <EmptyDescription>
              {canManage
                ? t('materials.emptyManage')
                : t('materials.emptyReadOnly')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {status === 'ready' && focusedId !== null ? (
        <Alert>
          <AlertDescription>
            {materials.some((material) => material.id === focusedId)
              ? t('materials.focused')
              : t('materials.focusedMissing')}
          </AlertDescription>
        </Alert>
      ) : null}

      {status === 'ready' && materials.length > 0 ? (
        <div className='grid gap-4 md:grid-cols-2'>
          {materials.map((material) => (
            <Card
              className={
                material.id === focusedId ? 'ring-2 ring-primary' : undefined
              }
              id={`material-${material.id}`}
              key={material.id}
            >
              <CardHeader>
                <div className='flex items-start justify-between gap-3'>
                  <CardTitle className='min-w-0'>{material.title}</CardTitle>
                  <Badge
                    variant={
                      material.confidential ? 'destructive' : 'secondary'
                    }
                  >
                    {material.confidential
                      ? t('materials.confidential')
                      : t('materials.public')}
                  </Badge>
                </div>
                {material.confidential ? (
                  <CardDescription>
                    {t('materials.confidentialHint')}
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className='space-y-4'>
                <p className='whitespace-pre-wrap text-sm leading-6'>
                  {material.body}
                </p>
                {canManage ? (
                  <div className='flex items-center gap-2'>
                    <Button
                      onClick={() => openEdit(material)}
                      size='sm'
                      type='button'
                      variant='outline'
                    >
                      <PencilIcon />
                      {t('actions.edit')}
                    </Button>
                    <Button
                      onClick={() => setDeleteTarget(material)}
                      size='sm'
                      type='button'
                      variant='outline'
                    >
                      <Trash2Icon />
                      {t('actions.delete')}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent>
          <form onSubmit={(event) => void submit(event)}>
            <DialogHeader>
              <DialogTitle>
                {editing
                  ? t('materials.form.editTitle')
                  : t('materials.form.createTitle')}
              </DialogTitle>
              <DialogDescription>
                {t('materials.form.description')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field>
                <FieldLabel htmlFor='material-title'>
                  {t('materials.form.title')}
                </FieldLabel>
                <Input
                  id='material-title'
                  maxLength={255}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  required
                  value={form.title}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='material-body'>
                  {t('materials.form.body')}
                </FieldLabel>
                <Textarea
                  id='material-body'
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      body: event.target.value,
                    }))
                  }
                  required
                  rows={6}
                  value={form.body}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                onClick={() => setDialogOpen(false)}
                type='button'
                variant='outline'
              >
                {t('actions.cancel')}
              </Button>
              <Button disabled={saving} type='submit'>
                {saving ? t('materials.form.saving') : t('actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('materials.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('materials.delete.description', {
                title: deleteTarget?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? t('materials.delete.deleting') : t('actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
