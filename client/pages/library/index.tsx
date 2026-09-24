import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

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
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

interface Material {
  readonly id: string;
  readonly title: string;
  readonly body: string | null;
  readonly ownerId: string;
  readonly published: boolean;
  readonly confidential: boolean;
  /** Server-evaluated eligibility for this row against the edit Policy. */
  readonly canEdit: boolean;
  /** Server-evaluated eligibility for this row against the delete Policy. */
  readonly canDelete: boolean;
}

interface MaterialListResponse {
  readonly data: Material[];
  readonly meta?: { readonly canCreate?: boolean };
}

interface MaterialForm {
  readonly title: string;
  readonly body: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

const EMPTY_FORM: MaterialForm = {
  title: '',
  body: '',
  published: false,
  confidential: false,
};

/**
 * The one page the library needs: a single table over `materials`. It never
 * filters rows or infers permissions — the endpoint returns only the records
 * the signed-in account may read, together with the per-row edit/delete
 * eligibility each action's Policy proves and the collection-wide create
 * capability. Every mutation is authorized again on its own endpoint.
 */
export default function LibraryPage() {
  const { t } = useTranslation();
  const api = useApiClient();
  const [materials, setMaterials] = useState<readonly Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [canCreate, setCanCreate] = useState(false);
  const [editing, setEditing] = useState<Material | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<MaterialForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Material | undefined>();

  const canCreateMaterial = canCreate;

  const reload = useCallback(async () => {
    // State is only set after the request settles, so mounting the page (which
    // initializes `loading` to true) never triggers a synchronous cascading
    // render from the effect below.
    try {
      const response = await api.request<MaterialListResponse>({
        path: 'library/materials',
      });
      setMaterials(response.data);
      setCanCreate(response.meta?.canCreate === true);
      setError(undefined);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t('library.loadFailed'),
      );
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  useEffect(() => {
    // The load is deferred to a microtask so the effect never triggers a
    // synchronous cascading render (`react-hooks/set-state-in-effect`).
    void Promise.resolve().then(() => reload());
  }, [reload]);

  const openCreate = () => {
    setEditing(undefined);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (material: Material) => {
    setEditing(material);
    setForm({
      title: material.title,
      body: material.body ?? '',
      published: material.published,
      confidential: material.confidential,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const json = {
        title: form.title,
        body: form.body,
        published: form.published,
        confidential: form.confidential,
      };
      if (editing) {
        await api.request({
          path: `library/materials/${encodeURIComponent(editing.id)}`,
          method: 'PATCH',
          json,
        });
      } else {
        await api.request({
          path: 'library/materials',
          method: 'POST',
          json,
        });
      }
      setDialogOpen(false);
      toast.success(t('library.saved'));
      await reload();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : t('library.saveFailed'),
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await api.request({
        path: `library/materials/${encodeURIComponent(deleting.id)}`,
        method: 'DELETE',
      });
      toast.success(t('library.deleted'));
      await reload();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : t('library.deleteFailed'),
      );
    } finally {
      setDeleting(undefined);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('library.title')}
        description={t('library.description')}
        actions={
          canCreateMaterial ? (
            <Button onClick={openCreate}>
              <Plus />
              {t('library.create')}
            </Button>
          ) : null
        }
      />

      <Card>
        <CardContent className='pt-6'>
          {loading ? (
            <p className='text-sm text-muted-foreground'>
              {t('status.loading')}
            </p>
          ) : error ? (
            <div className='space-y-2'>
              <p className='text-sm text-destructive'>{error}</p>
              <Button variant='outline' onClick={() => void reload()}>
                {t('status.retry')}
              </Button>
            </div>
          ) : materials.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('dataTable.noResults')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('library.field.title')}</TableHead>
                  <TableHead>{t('library.field.published')}</TableHead>
                  <TableHead>{t('library.field.confidential')}</TableHead>
                  <TableHead className='text-right'>
                    {t('library.field.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((material) => (
                  <TableRow key={material.id}>
                    <TableCell className='font-medium'>
                      {material.title}
                    </TableCell>
                    <TableCell>
                      {material.published ? t('library.yes') : t('library.no')}
                    </TableCell>
                    <TableCell>
                      {material.confidential
                        ? t('library.yes')
                        : t('library.no')}
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='flex justify-end gap-2'>
                        {material.canEdit ? (
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() => openEdit(material)}
                          >
                            <Pencil />
                            {t('library.edit')}
                          </Button>
                        ) : null}
                        {material.canDelete ? (
                          <Button
                            variant='destructive'
                            size='sm'
                            onClick={() => setDeleting(material)}
                          >
                            <Trash2 />
                            {t('library.delete')}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? t('library.edit') : t('library.create')}
            </DialogTitle>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='library-title'>{t('library.field.title')}</Label>
              <Input
                id='library-title'
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='library-body'>{t('library.field.body')}</Label>
              <Textarea
                id='library-body'
                value={form.body}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    body: event.target.value,
                  }))
                }
              />
            </div>
            <div className='flex items-center justify-between'>
              <Label htmlFor='library-published'>
                {t('library.field.published')}
              </Label>
              <Switch
                id='library-published'
                checked={form.published}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, published: checked }))
                }
              />
            </div>
            <div className='flex items-center justify-between'>
              <Label htmlFor='library-confidential'>
                {t('library.field.confidential')}
              </Label>
              <Switch
                id='library-confidential'
                checked={form.confidential}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, confidential: checked }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDialogOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('library.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('library.deleteConfirm', { title: deleting?.title ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>
              {t('actions.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
