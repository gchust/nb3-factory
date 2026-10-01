/**
 * 资料库 — the service team's read-only reference materials.
 *
 * Every signed-in user reaches the page. What they see is decided on the
 * server: a colleague receives the public materials only, a supervisor
 * receives every material and may edit it. The page never filters by role
 * itself, so what it renders is exactly what the caller is permitted to read.
 *
 * Skeleton: `PageContainer` → `PageHeader` → `Card` grid, one card per
 * material, with a `Sheet` that opens the selected material for reading or, for
 * a supervisor, editing. `?id=<id>` deep-links the sheet, which is how an
 * assistant citation opens the material it used.
 */
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { FileTextIcon, PencilIcon } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
  fetchMaterials,
  updateMaterial,
  type Material,
  type MaterialsList,
} from '@/lib/materials-api';

interface Draft {
  title: string;
  body: string;
  visibility: string;
}

export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [searchParams, setSearchParams] = useSearchParams();

  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    title: '',
    body: '',
    visibility: 'public',
  });
  const [saving, setSaving] = useState(false);

  const selectedId = Number(searchParams.get('id')) || null;
  const selected =
    selectedId === null
      ? undefined
      : (materials ?? []).find((material) => material.id === selectedId);

  const applyList = useCallback((list: MaterialsList) => {
    setMaterials(list.materials);
    setCanManage(list.canManage);
    setError(false);
  }, []);

  // The first load happens in the effect rather than through a shared callback
  // so state is only set from an async callback, never synchronously in render.
  useEffect(() => {
    let active = true;
    void fetchMaterials(api)
      .then((list) => {
        if (active) applyList(list);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setMaterials([]);
        setCanManage(false);
      });
    return () => {
      active = false;
    };
  }, [api, applyList]);

  const retry = useCallback(() => {
    void fetchMaterials(api)
      .then(applyList)
      .catch(() => {
        setError(true);
        setMaterials([]);
        setCanManage(false);
      });
  }, [api, applyList]);

  const closeSheet = useCallback(() => {
    setEditing(false);
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const beginEdit = useCallback((material: Material) => {
    setDraft({
      title: material.title,
      body: material.body,
      visibility: material.visibility,
    });
    setEditing(true);
  }, []);

  const save = useCallback(async () => {
    if (selectedId === null) return;
    setSaving(true);
    try {
      const updated = await updateMaterial(api, selectedId, draft);
      setMaterials((current) =>
        (current ?? []).map((material) =>
          material.id === updated.id ? updated : material,
        ),
      );
      setEditing(false);
      toaster.show({ type: 'success', title: t('materials.saved') });
    } catch {
      toaster.show({ type: 'error', title: t('materials.saveFailed') });
    } finally {
      setSaving(false);
    }
  }, [api, draft, selectedId, t, toaster]);

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.title')}
        description={t('materials.description')}
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('materials.loadFailedTitle')}</AlertTitle>
          <AlertDescription>{t('materials.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button size='sm' variant='outline' onClick={retry}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {materials === null ? (
        <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className='h-40 rounded-xl' />
          ))}
        </div>
      ) : error ? null : materials.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('materials.empty')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
          {materials.map((material) => (
            <Card key={material.id}>
              <CardHeader>
                <CardTitle>{material.title}</CardTitle>
                <CardAction>
                  {material.visibility === 'public' ? null : (
                    <Badge variant='secondary'>
                      {t('materials.supervisorOnly')}
                    </Badge>
                  )}
                </CardAction>
                <CardDescription className='line-clamp-4 whitespace-pre-line'>
                  {material.body}
                </CardDescription>
              </CardHeader>
              <CardContent className='mt-auto'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.set('id', String(material.id));
                    setSearchParams(next);
                  }}
                >
                  <FileTextIcon data-icon='inline-start' />
                  {t('materials.open')}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
      >
        <SheetContent className='sm:max-w-lg'>
          <SheetHeader>
            <SheetTitle>{t('materials.detailTitle')}</SheetTitle>
            <SheetDescription>
              {t('materials.detailDescription')}
            </SheetDescription>
          </SheetHeader>
          <div className='min-h-0 flex-1 overflow-y-auto px-4'>
            {selected === undefined ? (
              <Alert variant='destructive'>
                <AlertTitle>{t('materials.notFoundTitle')}</AlertTitle>
                <AlertDescription>{t('materials.notFound')}</AlertDescription>
              </Alert>
            ) : editing ? (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor='material-title'>
                    {t('materials.fieldTitle')}
                  </FieldLabel>
                  <Input
                    id='material-title'
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor='material-body'>
                    {t('materials.fieldBody')}
                  </FieldLabel>
                  <Textarea
                    id='material-body'
                    rows={8}
                    value={draft.body}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        body: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor='material-visibility'>
                    {t('materials.fieldVisibility')}
                  </FieldLabel>
                  <Input
                    id='material-visibility'
                    value={draft.visibility}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        visibility: event.target.value,
                      }))
                    }
                  />
                </Field>
              </FieldGroup>
            ) : (
              <div className='space-y-4'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h2 className='font-heading text-xl font-semibold'>
                    {selected.title}
                  </h2>
                  {selected.visibility === 'public' ? null : (
                    <Badge variant='secondary'>
                      {t('materials.supervisorOnly')}
                    </Badge>
                  )}
                </div>
                <Separator />
                <p className='whitespace-pre-line text-sm leading-6'>
                  {selected.body}
                </p>
              </div>
            )}
          </div>
          {selected !== undefined && canManage ? (
            <SheetFooter>
              {editing ? (
                <Button
                  variant='outline'
                  disabled={saving}
                  onClick={() => setEditing(false)}
                >
                  {t('actions.cancel')}
                </Button>
              ) : (
                <Button variant='outline' onClick={() => beginEdit(selected)}>
                  <PencilIcon data-icon='inline-start' />
                  {t('materials.edit')}
                </Button>
              )}
              {editing ? (
                <Button disabled={saving} onClick={() => void save()}>
                  {saving ? <Spinner data-icon='inline-start' /> : null}
                  {saving ? t('materials.saving') : t('actions.save')}
                </Button>
              ) : null}
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}
