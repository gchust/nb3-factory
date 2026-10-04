import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
  KNOWLEDGE_MATERIALS_COLLECTION,
  KNOWLEDGE_MATERIALS_RESOURCE,
} from '@/knowledge.js';

/** The two items a material holds, plus the database's own identifier. */
interface KnowledgeMaterial {
  id: string;
  title: string;
  content: string;
}

/**
 * Every material the signed-in person may read, and the entry point to one of them and to the assistant.
 *
 * The list itself carries no permission logic. It asks the generated Repository route for materials, and the
 * authorization layer answers with the records the stored grant allows, so a colleague's list is missing the
 * supervisor-only material without this page knowing that material exists.
 *
 * The supervisor's affordances are gated on the same `edit` action of the composite resource that the server
 * enforces. `useCan` reads the permission snapshot the server built from the same grants the routes use, so a person
 * who may not edit never sees the control in the first place.
 */
export default function MaterialsPage(): ReactElement {
  const api = useApiClient();
  const toaster = useToaster();
  const { t } = useTranslation();
  const location = useLocation();
  const edit = useCan({
    resource: { type: 'composite', id: KNOWLEDGE_MATERIALS_RESOURCE },
    action: 'edit',
  });

  const [materials, setMaterials] = useState<KnowledgeMaterial[] | undefined>();
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Bumped to re-run the read below, which is the only place the request is made. */
  const [revision, setRevision] = useState(0);

  // The request is started from the effect and every state update happens in a callback, so nothing is set while
  // React is still committing this render.
  useEffect(() => {
    let cancelled = false;
    api
      .repository<KnowledgeMaterial>(KNOWLEDGE_MATERIALS_COLLECTION)
      .findMany()
      .then((rows) => {
        if (cancelled) return;
        setMaterials(
          [...rows].sort((left, right) => left.id.localeCompare(right.id)),
        );
        setFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setMaterials([]);
      });
    return () => {
      cancelled = true;
    };
  }, [api, revision]);

  const reload = useCallback(() => {
    setFailed(false);
    setRevision((current) => current + 1);
  }, []);

  const columns = useMemo<ColumnDef<KnowledgeMaterial, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('knowledge.materials.columns.title')}
          />
        ),
        cell: ({ row }) => (
          <Link
            className='font-medium underline-offset-4 hover:underline'
            to={{ pathname: row.original.id, search: location.search }}
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'content',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('knowledge.materials.columns.content')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>{row.original.content}</span>
        ),
        enableSorting: false,
      },
    ],
    [location.search, t],
  );

  const handleCreate = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = textField(form, 'title');
    const content = textField(form, 'content');
    if (!title || !content) return;
    setSubmitting(true);
    try {
      await api
        .repository<KnowledgeMaterial>(KNOWLEDGE_MATERIALS_COLLECTION)
        .createOne({
          values: { id: crypto.randomUUID(), title, content },
        });
      setCreating(false);
      reload();
      toaster.show({
        type: 'success',
        title: t('knowledge.materials.created'),
      });
    } catch {
      toaster.show({
        type: 'error',
        title: t('knowledge.materials.createFailed'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('knowledge.materials.title')}
        description={t('knowledge.materials.description')}
        actions={
          edit.can ? (
            <Button onClick={() => setCreating(true)}>
              <Plus data-icon='inline-start' />
              {t('knowledge.materials.newMaterial')}
            </Button>
          ) : undefined
        }
      />

      {failed ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('knowledge.materials.loadFailed')}</AlertTitle>
          <AlertDescription>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : materials === undefined ? (
        <p className='text-muted-foreground text-sm' role='status'>
          {t('status.loading')}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={materials}
          getRowId={(row) => row.id}
          emptyMessage={t('knowledge.materials.empty')}
          pageSize={20}
        />
      )}

      {edit.can ? (
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogContent>
            <form onSubmit={(event) => void handleCreate(event)}>
              <DialogHeader>
                <DialogTitle>
                  {t('knowledge.materials.newMaterial')}
                </DialogTitle>
                <DialogDescription>
                  {t('knowledge.materials.newMaterialDescription')}
                </DialogDescription>
              </DialogHeader>
              <FieldGroup className='py-6'>
                <Field>
                  <FieldLabel htmlFor='material-title'>
                    {t('knowledge.materials.fieldTitle')}
                  </FieldLabel>
                  <Input
                    id='material-title'
                    name='title'
                    autoComplete='off'
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor='material-content'>
                    {t('knowledge.materials.fieldContent')}
                  </FieldLabel>
                  <Textarea id='material-content' name='content' required />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setCreating(false)}
                >
                  {t('actions.cancel')}
                </Button>
                <Button type='submit' disabled={submitting}>
                  {t('actions.create')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* The detail page renders into this Outlet, covering this page while its route is active. */}
      <Outlet />
    </PageContainer>
  );
}

/** A form field's text, ignoring a File even though these two fields can only ever hold a string. */
function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}
