import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation, useLocale } from '@nocobase/i18n/client';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/** One material as `GET /api/materials` returns it. */
interface Material {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly confidential: boolean;
  readonly createdAt: string;
}

type LoadState = 'loading' | 'ready' | 'error';

const MATERIALS_PATH = '/materials';

/**
 * The materials the signed-in reader may open, with the supervisor's edit
 * control when the same session may change them.
 *
 * The page never decides what a reader sees: `GET /api/materials` answers with
 * the caller's own scope, so a colleague's response simply contains no
 * confidential material and the page has nothing to hide. The edit control is
 * shown from the client permission snapshot and enforced again by the API.
 */
export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const apiClient = useApiClient();
  const toaster = useToaster();

  const [materials, setMaterials] = useState<readonly Material[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<Material | null>(null);

  const canEdit = useCan({
    resource: { type: 'composite', id: 'internalMaterials' },
    action: 'edit',
  });

  useEffect(() => {
    let cancelled = false;
    apiClient
      .request<{ data: readonly Material[] }>({
        path: MATERIALS_PATH,
        query: { pageSize: 100 },
      })
      .then((response) => {
        if (cancelled) return;
        setMaterials(response.data);
        setState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, reloadKey]);

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }),
    [locale],
  );

  function applyUpdated(updated: Material): void {
    setMaterials((current) =>
      current.map((material) =>
        material.id === updated.id ? updated : material,
      ),
    );
    toaster.show({ type: 'success', title: t('materials.saved') });
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.title')}
        description={t('materials.description')}
      />

      {state === 'loading' ? (
        <div className='space-y-3' aria-busy='true'>
          <Skeleton className='h-28 w-full' />
          <Skeleton className='h-28 w-full' />
        </div>
      ) : null}

      {state === 'error' ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('materials.loadFailed')}</AlertTitle>
          <AlertDescription>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => {
                setState('loading');
                setReloadKey((key) => key + 1);
              }}
            >
              {t('materials.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {state === 'ready' && materials.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('materials.empty')}</p>
      ) : null}

      {state === 'ready' && materials.length > 0 ? (
        <ul className='space-y-4'>
          {materials.map((material) => (
            <li
              key={material.id}
              className='rounded-lg border border-border bg-card p-5'
            >
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='min-w-0 space-y-2'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <h2 className='font-heading text-lg font-medium'>
                      {material.title}
                    </h2>
                    {material.confidential ? (
                      <span
                        className={cn(
                          'rounded-full border border-destructive/40 px-2 py-0.5',
                          'text-xs font-medium text-destructive',
                        )}
                      >
                        {t('materials.confidential')}
                      </span>
                    ) : null}
                  </div>
                  <p className='whitespace-pre-wrap text-sm leading-6 text-muted-foreground'>
                    {material.body}
                  </p>
                  <p className='text-xs text-muted-foreground/80'>
                    {t('materials.updatedAt', {
                      date: dateFormat.format(new Date(material.createdAt)),
                    })}
                  </p>
                </div>
                {canEdit.can ? (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => setEditing(material)}
                  >
                    {t('materials.edit')}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {editing ? (
        <EditMaterialDialog
          key={editing.id}
          material={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSaved={(updated) => {
            applyUpdated(updated);
            setEditing(null);
          }}
        />
      ) : null}
    </PageContainer>
  );
}

interface EditMaterialDialogProps {
  readonly material: Material;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: (material: Material) => void;
}

function EditMaterialDialog({
  material,
  onOpenChange,
  onSaved,
}: EditMaterialDialogProps): ReactElement {
  const { t } = useTranslation();
  const apiClient = useApiClient();
  const toaster = useToaster();
  const [title, setTitle] = useState(material.title);
  const [body, setBody] = useState(material.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    if (!title.trim() || !body.trim()) {
      setError(t('materials.saveFailed'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await apiClient.request<{ data: Material }>({
        path: `${MATERIALS_PATH}/${encodeURIComponent(material.id)}`,
        method: 'PATCH',
        json: { title: title.trim(), body: body.trim() },
      });
      onSaved(response.data);
    } catch {
      setError(t('materials.saveFailed'));
      toaster.show({ type: 'error', title: t('materials.saveFailed') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('materials.editTitle')}</DialogTitle>
          <DialogDescription>
            {t('materials.editDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field>
            <FieldLabel htmlFor='material-title'>
              {t('materials.titleLabel')}
            </FieldLabel>
            <Input
              id='material-title'
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={saving}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='material-body'>
              {t('materials.bodyLabel')}
            </FieldLabel>
            <Textarea
              id='material-body'
              value={body}
              rows={5}
              onChange={(event) => setBody(event.target.value)}
              disabled={saving}
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
          <DialogFooter>
            <DialogClose
              render={<Button type='button' variant='outline' />}
              disabled={saving}
            >
              {t('actions.cancel')}
            </DialogClose>
            <Button type='submit' disabled={saving}>
              {saving ? t('materials.saving') : t('materials.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
