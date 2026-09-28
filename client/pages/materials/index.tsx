import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Toaster, toast } from '@/components/ui/toast';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Bot, PencilIcon, RefreshCwIcon } from 'lucide-react';
import { Link } from 'react-router';
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useState,
} from 'react';

type MaterialAudience = 'all' | 'manager';

interface Material {
  readonly id: number;
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly audience: MaterialAudience;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface MaterialsOverview {
  readonly materials: readonly Material[];
  readonly canManage: boolean;
}

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly materials: readonly Material[];
      readonly canManage: boolean;
    };

/**
 * The materials a signed-in user may read.
 *
 * Visibility is decided by the server, per record: this page renders exactly
 * the list the API returned and never filters or widens it, so a colleague
 * cannot reach a manager-only material by way of the page — and, because the
 * assistant's search tool calls the same service, not by way of a question
 * either. Managers additionally get an edit dialog, which is the flow that
 * makes an edited material show up in a later answer.
 */
export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [editing, setEditing] = useState<Material | null>(null);

  const applyOverview = useCallback((overview: MaterialsOverview): void => {
    setState({
      status: 'ready',
      materials: overview.materials,
      canManage: overview.canManage,
    });
  }, []);

  // Bumping the key re-runs the fetch below, which is how both the retry button
  // and a saved edit refresh the list.
  const [refreshKey, setRefreshKey] = useState(0);
  const reload = useCallback((): void => {
    setState({ status: 'loading' });
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void api
      .request<{ data: MaterialsOverview }>({
        path: '/materials',
        method: 'GET',
      })
      .then((response) => {
        if (active) {
          applyOverview(response.data);
        }
      })
      .catch(() => {
        if (active) {
          setState({ status: 'error' });
        }
      });
    return () => {
      active = false;
    };
  }, [api, applyOverview, refreshKey]);

  const canManage = state.status === 'ready' && state.canManage;

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.title')}
        description={
          canManage
            ? t('materials.descriptionManager')
            : t('materials.description')
        }
        actions={
          <Link
            className='inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground'
            to='/assistant'
          >
            <Bot aria-hidden='true' className='size-4' />
            {t('materials.askAssistant')}
          </Link>
        }
      />

      {state.status === 'loading' ? <MaterialsSkeleton /> : null}

      {state.status === 'error' ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('materials.loadFailed')}</AlertTitle>
          <AlertDescription>
            {t('materials.loadFailedDescription')}
          </AlertDescription>
          <div className='pt-3'>
            <Button onClick={reload} variant='outline'>
              <RefreshCwIcon aria-hidden='true' className='size-4' />
              {t('materials.retry')}
            </Button>
          </div>
        </Alert>
      ) : null}

      {state.status === 'ready' && state.materials.length === 0 ? (
        <Alert>
          <AlertTitle>{t('materials.empty')}</AlertTitle>
          <AlertDescription>{t('materials.emptyDescription')}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === 'ready' && state.materials.length > 0 ? (
        <div className='grid gap-4 md:grid-cols-2'>
          {state.materials.map((material) => (
            <Card key={material.id}>
              <CardHeader>
                <div className='flex flex-wrap items-start justify-between gap-3'>
                  <CardTitle>{material.title}</CardTitle>
                  <Badge
                    variant={
                      material.audience === 'manager' ? 'secondary' : 'outline'
                    }
                  >
                    {t(`materials.audience.${material.audience}`)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className='text-sm leading-6 whitespace-pre-line'>
                  {material.body}
                </p>
              </CardContent>
              <CardFooter className='flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground'>
                <span>
                  {t('materials.slugLabel')}
                  {' · '}
                  <code className='rounded bg-muted px-1 py-0.5'>
                    {material.slug}
                  </code>
                </span>
                {state.canManage ? (
                  <Button
                    onClick={() => setEditing(material)}
                    size='sm'
                    variant='outline'
                  >
                    <PencilIcon aria-hidden='true' className='size-4' />
                    {t('materials.edit')}
                  </Button>
                ) : null}
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <p className='text-xs text-muted-foreground'>
          {state.canManage
            ? t('materials.managerScopeNotice')
            : t('materials.colleagueScopeNotice')}
        </p>
      ) : null}

      {editing ? (
        <EditMaterialDialog
          material={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            toast.add({
              type: 'success',
              title: t('materials.saveSuccess'),
            });
            reload();
          }}
        />
      ) : null}

      <Toaster />
    </PageContainer>
  );
}

function MaterialsSkeleton(): ReactElement {
  return (
    <div className='grid gap-4 md:grid-cols-2'>
      {[0, 1].map((index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className='h-5 w-2/3' />
          </CardHeader>
          <CardContent className='space-y-2'>
            <Skeleton className='h-4 w-full' />
            <Skeleton className='h-4 w-5/6' />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EditMaterialDialog({
  material,
  onClose,
  onSaved,
}: {
  readonly material: Material;
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [title, setTitle] = useState(material.title);
  const [body, setBody] = useState(material.body);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await api.request({
        path: `/materials/${material.id}`,
        method: 'PATCH',
        json: { title, body },
      });
      await onSaved();
    } catch {
      toast.add({
        type: 'error',
        title: t('materials.saveFailed'),
      });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('materials.editTitle')}</DialogTitle>
          <DialogDescription>
            {t('materials.editDescription')}
          </DialogDescription>
        </DialogHeader>
        <form className='space-y-4' onSubmit={(event) => void submit(event)}>
          <div className='space-y-2'>
            <Label htmlFor='material-title'>{t('materials.form.title')}</Label>
            <Input
              id='material-title'
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='material-body'>{t('materials.form.body')}</Label>
            <Textarea
              id='material-body'
              onChange={(event) => setBody(event.target.value)}
              required
              rows={6}
              value={body}
            />
          </div>
          <DialogFooter>
            <Button onClick={onClose} type='button' variant='outline'>
              {t('actions.cancel')}
            </Button>
            <Button disabled={saving} type='submit'>
              {saving ? t('materials.saving') : t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
