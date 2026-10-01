import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useState,
} from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

/** The resource this page checks feature visibility against; must match `server/library/resources.ts`. */
const MATERIALS_RESOURCE = {
  id: 'library.materials',
  type: 'composite',
} as const;

/** One material as the API returns it. */
interface Material {
  id: string;
  title: string;
  content: string | null;
  ownerId: string;
  ownerName?: string;
  published: boolean;
  confidential: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MaterialsResponse {
  data: Material[];
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

/**
 * The material library.
 *
 * A reader sees only the published, non-confidential materials a permission set or a temporary sharing rule opened to
 * them; a curator sees and maintains their own. Every visibility decision here is a mirror of the server's: the
 * endpoints authorize the composite action and run the repository under that policy, and this page only decides which
 * controls to render. Hiding a button is never the protection.
 */
export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const canCreate = useCan({ action: 'create', resource: MATERIALS_RESOURCE });
  const canEdit = useCan({ action: 'edit', resource: MATERIALS_RESOURCE });
  const canDelete = useCan({ action: 'delete', resource: MATERIALS_RESOURCE });

  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [selected, setSelected] = useState<Material | null>(null);
  const [deleting, setDeleting] = useState<Material | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.request<MaterialsResponse>({
        path: '/materials',
      });
      setMaterials(response.data ?? []);
      setLoadError(undefined);
    } catch (cause) {
      setLoadError(errorMessage(cause, t('library.error.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  useEffect(() => {
    let active = true;
    void api
      .request<MaterialsResponse>({ path: '/materials' })
      .then((response) => {
        if (!active) return;
        setMaterials(response.data ?? []);
        setLoadError(undefined);
      })
      .catch((cause: unknown) => {
        if (active)
          setLoadError(errorMessage(cause, t('library.error.loadFailed')));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, t]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((material: Material) => {
    setEditing(material);
    setFormOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    const target = deleting;
    if (!target) return;
    try {
      await api.request({ method: 'DELETE', path: `/materials/${target.id}` });
      toaster.show({ title: t('library.toast.deleted'), type: 'success' });
      setDeleting(null);
      setSelected(null);
      await load();
    } catch (cause) {
      toaster.show({
        description: errorMessage(cause, t('library.error.deleteFailed')),
        title: t('library.error.deleteFailed'),
        type: 'error',
      });
    }
  }, [api, deleting, load, t, toaster]);

  const columns: ColumnDef<Material>[] = [
    {
      accessorKey: 'title',
      cell: ({ row }) => (
        <span className='font-medium'>{row.original.title}</span>
      ),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('library.column.title')}
        />
      ),
    },
    {
      accessorKey: 'ownerId',
      cell: ({ row }) => (
        <span className='text-muted-foreground'>
          {row.original.ownerName ?? row.original.ownerId}
        </span>
      ),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('library.column.owner')}
        />
      ),
    },
    {
      accessorKey: 'published',
      cell: ({ row }) =>
        row.original.published ? (
          <Badge variant='secondary'>{t('library.published')}</Badge>
        ) : (
          <Badge variant='outline'>{t('library.draft')}</Badge>
        ),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('library.column.published')}
        />
      ),
    },
    {
      accessorKey: 'confidential',
      cell: ({ row }) =>
        row.original.confidential ? (
          <Badge variant='destructive'>{t('library.confidential')}</Badge>
        ) : (
          <span className='text-muted-foreground'>—</span>
        ),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('library.column.confidential')}
        />
      ),
    },
    {
      accessorKey: 'updatedAt',
      cell: ({ row }) => (
        <span className='text-muted-foreground'>
          {formatDate(row.original.updatedAt)}
        </span>
      ),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('library.column.updatedAt')}
        />
      ),
    },
  ];

  if (canEdit.can || canDelete.can) {
    columns.push({
      cell: ({ row }) => (
        <div className='flex justify-end gap-2'>
          {canEdit.can ? (
            <Button
              onClick={(event) => {
                event.stopPropagation();
                openEdit(row.original);
              }}
              size='sm'
              variant='outline'
            >
              <PencilIcon />
              {t('library.action.edit')}
            </Button>
          ) : null}
          {canDelete.can ? (
            <Button
              onClick={(event) => {
                event.stopPropagation();
                setDeleting(row.original);
              }}
              size='sm'
              variant='destructive'
            >
              <Trash2Icon />
              {t('library.action.delete')}
            </Button>
          ) : null}
        </div>
      ),
      enableHiding: false,
      header: () => (
        <span className='sr-only'>{t('library.column.actions')}</span>
      ),
      id: 'actions',
    });
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          canCreate.can ? (
            <Button onClick={openCreate}>
              <PlusIcon />
              {t('library.new')}
            </Button>
          ) : null
        }
        description={t('library.pageDescription')}
        title={t('library.title')}
      />

      {loadError ? (
        <Alert variant='destructive'>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        columns={columns}
        data={materials}
        emptyMessage={loading ? t('status.loading') : t('library.empty')}
        getRowId={(row) => String(row.id)}
        onRowClick={(row) => setSelected(row.original)}
      />

      {formOpen ? (
        <MaterialFormDialog
          key={editing?.id ?? 'new'}
          material={editing}
          onOpenChange={(open) => setFormOpen(open)}
          onSaved={load}
        />
      ) : null}

      <Sheet
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        open={selected !== null}
      >
        <SheetContent className='sm:max-w-lg'>
          <SheetHeader>
            <SheetTitle>{selected?.title}</SheetTitle>
            <SheetDescription>
              {selected?.published
                ? t('library.published')
                : t('library.draft')}
              {selected?.confidential ? ` · ${t('library.confidential')}` : ''}
            </SheetDescription>
          </SheetHeader>
          <div className='space-y-4 px-4'>
            <p className='whitespace-pre-wrap text-sm leading-6'>
              {selected?.content || t('library.noContent')}
            </p>
            <dl className='grid grid-cols-2 gap-2 text-sm'>
              <dt className='text-muted-foreground'>
                {t('library.column.owner')}
              </dt>
              <dd>{selected?.ownerName ?? selected?.ownerId}</dd>
              <dt className='text-muted-foreground'>
                {t('library.column.createdAt')}
              </dt>
              <dd>{selected ? formatDate(selected.createdAt) : ''}</dd>
              <dt className='text-muted-foreground'>
                {t('library.column.updatedAt')}
              </dt>
              <dd>{selected ? formatDate(selected.updatedAt) : ''}</dd>
            </dl>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        open={deleting !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('library.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('library.deleteDescription', {
                title: deleting?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              variant='destructive'
            >
              {t('library.action.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

interface MaterialFormDialogProps {
  readonly material: Material | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => Promise<void> | void;
}

/**
 * The create/edit form. The server owns `ownerId` and the timestamps; this only sends what a curator may write. The
 * page mounts a fresh instance per material, so the fields below start from the record instead of syncing in an effect.
 */
function MaterialFormDialog({
  material,
  onOpenChange,
  onSaved,
}: MaterialFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const [title, setTitle] = useState(material?.title ?? '');
  const [content, setContent] = useState(material?.content ?? '');
  const [published, setPublished] = useState(material?.published ?? false);
  const [confidential, setConfidential] = useState(
    material?.confidential ?? false,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t('library.error.titleRequired'));
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const json = { confidential, content, published, title: trimmed };
      if (material) {
        await api.request({
          json,
          method: 'PATCH',
          path: `/materials/${material.id}`,
        });
        toaster.show({ title: t('library.toast.updated'), type: 'success' });
      } else {
        await api.request({ json, method: 'POST', path: '/materials' });
        toaster.show({ title: t('library.toast.created'), type: 'success' });
      }
      onOpenChange(false);
      await onSaved();
    } catch (cause) {
      setError(errorMessage(cause, t('library.error.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className='sm:max-w-lg'>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {material ? t('library.editTitle') : t('library.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('library.pageDescription')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-4'>
            <Field>
              <FieldLabel htmlFor='material-title'>
                {t('library.column.title')}
              </FieldLabel>
              <Input
                id='material-title'
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='material-content'>
                {t('library.content')}
              </FieldLabel>
              <Textarea
                id='material-content'
                onChange={(event) => setContent(event.target.value)}
                rows={6}
                value={content}
              />
            </Field>
            <Field orientation='horizontal'>
              <FieldContent>
                <FieldLabel htmlFor='material-published'>
                  {t('library.published')}
                </FieldLabel>
                <FieldDescription>
                  {t('library.publishedHint')}
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={published}
                id='material-published'
                onCheckedChange={setPublished}
              />
            </Field>
            <Field orientation='horizontal'>
              <FieldContent>
                <FieldLabel htmlFor='material-confidential'>
                  {t('library.confidential')}
                </FieldLabel>
                <FieldDescription>
                  {t('library.confidentialHint')}
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={confidential}
                id='material-confidential'
                onCheckedChange={setConfidential}
              />
            </Field>
            {error ? (
              <Alert variant='destructive'>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type='button'
              variant='outline'
            >
              {t('actions.cancel')}
            </Button>
            <Button disabled={saving} type='submit'>
              {saving ? t('actions.saving') : t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
