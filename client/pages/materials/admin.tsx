import { useTranslation } from '@nocobase/i18n/client';
import { useToaster } from '@nocobase/app-client';
import {
  FileTextIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import {
  createMaterial,
  deleteMaterial,
  listMaterials,
  updateMaterial,
  type MaterialDto,
} from './api.js';

/**
 * Supervisor-only maintenance screen. The route guard keeps it away from
 * colleagues, and every write also passes the server's `manage` check.
 */
export default function MaterialsAdminPage() {
  const { t } = useTranslation();
  const toaster = useToaster();

  const [materials, setMaterials] = useState<MaterialDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [editing, setEditing] = useState<MaterialDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<MaterialDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setMaterials(await listMaterials());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so the first `setLoading` runs after the effect body, not
    // synchronously inside it; the initial state already shows the loader.
    void Promise.resolve().then(load);
  }, [load]);

  const save = useCallback(
    async (
      target: MaterialDto | null,
      values: { title: string; content: string },
    ) => {
      setSaving(true);
      try {
        if (target) {
          await updateMaterial(target.id, values);
        } else {
          await createMaterial(values);
        }
        toaster.show({ type: 'success', title: t('materials.admin.saved') });
        setEditing(null);
        setCreating(false);
        await load();
      } catch {
        toaster.show({ type: 'error', title: t('materials.admin.saveFailed') });
      } finally {
        setSaving(false);
      }
    },
    [load, t, toaster],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleting) {
      return;
    }
    setDeletingBusy(true);
    try {
      await deleteMaterial(deleting.id);
      toaster.show({ type: 'success', title: t('materials.admin.deleted') });
      setDeleting(null);
      await load();
    } catch {
      toaster.show({ type: 'error', title: t('materials.admin.deleteFailed') });
    } finally {
      setDeletingBusy(false);
    }
  }, [deleting, load, t, toaster]);

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.admin.title')}
        description={t('materials.admin.description')}
        actions={
          <Button size='sm' onClick={() => setCreating(true)}>
            <PlusIcon data-icon='inline-start' />
            {t('materials.admin.new')}
          </Button>
        }
      />

      {loading ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('materials.loading')}
        </p>
      ) : error ? (
        <Card>
          <CardContent className='flex flex-col items-start gap-3 py-6'>
            <p role='alert' className='text-sm text-destructive'>
              {t('materials.loadFailed')}
            </p>
            <Button variant='outline' size='sm' onClick={() => void load()}>
              <RefreshCwIcon data-icon='inline-start' />
              {t('materials.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : materials.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('materials.empty')}</p>
      ) : (
        <div className='grid gap-4'>
          {materials.map((material) => (
            <Card key={material.id}>
              <CardHeader className='gap-2'>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <FileTextIcon className='size-4 text-muted-foreground' />
                  <span>{material.title}</span>
                  <Badge variant='outline' className='shrink-0'>
                    #{material.id}
                  </Badge>
                  {material.confidential ? (
                    <Badge variant='secondary' className='shrink-0 gap-1'>
                      <LockIcon className='size-3' />
                      {t('materials.admin.confidential')}
                    </Badge>
                  ) : null}
                  <span className='ml-auto flex shrink-0 gap-2'>
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      aria-label={t('materials.admin.edit')}
                      onClick={() => setEditing(material)}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      aria-label={t('materials.admin.delete')}
                      onClick={() => setDeleting(material)}
                    >
                      <Trash2Icon />
                    </Button>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className='whitespace-pre-wrap text-sm leading-6 text-foreground'>
                  {material.content}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {creating || editing ? (
        <MaterialFormDialog
          material={editing}
          saving={saving}
          onOpenChange={(next) => {
            if (!next) {
              setCreating(false);
              setEditing(null);
            }
          }}
          onSubmit={(values) => void save(editing, values)}
        />
      ) : null}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) {
            setDeleting(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('materials.admin.deleteConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('materials.admin.deleteConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBusy}>
              {t('materials.admin.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingBusy}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {t('materials.admin.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

interface MaterialFormDialogProps {
  readonly material: MaterialDto | null;
  readonly saving: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (values: { title: string; content: string }) => void;
}

/**
 * Mounted only while the dialog is open, so each open starts from the target
 * material's current values instead of syncing them through an effect.
 */
function MaterialFormDialog({
  material,
  saving,
  onOpenChange,
  onSubmit,
}: MaterialFormDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(material?.title ?? '');
  const [content, setContent] = useState(material?.content ?? '');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !content.trim()) {
      return;
    }
    onSubmit({ title: title.trim(), content });
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {material
                ? t('materials.admin.editTitle')
                : t('materials.admin.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('materials.admin.formDescription')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-4'>
            <Field>
              <FieldLabel htmlFor='material-title'>
                {t('materials.admin.titleLabel')}
              </FieldLabel>
              <Input
                id='material-title'
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='material-content'>
                {t('materials.admin.contentLabel')}
              </FieldLabel>
              <Textarea
                id='material-content'
                value={content}
                rows={6}
                onChange={(event) => setContent(event.target.value)}
                required
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              {t('materials.admin.cancel')}
            </Button>
            <Button type='submit' disabled={saving}>
              {saving ? t('materials.admin.saving') : t('materials.admin.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
