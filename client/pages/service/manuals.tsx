import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';

import { useServiceApi, type ManualInput } from '@/service/api.js';
import { useSession } from '@/service/session.js';
import {
  EmptyState,
  ErrorState,
  PageLoading,
  errorMessage,
  formatDateTime,
  useAsync,
} from '@/service/ui.js';
import type { ServiceManual } from '@/service/types.js';

const EMPTY: ManualInput = {
  title: '',
  version: 'v1',
  content: '',
  status: 'published',
};

export default function ManualsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const { isSupervisor } = useSession();
  const manuals = useAsync(() => api.listManuals(), []);
  const [editing, setEditing] = useState<ManualInput>();
  const [reading, setReading] = useState<ServiceManual>();
  const [removing, setRemoving] = useState<ServiceManual>();
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<ManualInput>): void =>
    setEditing((current) => ({ ...(current ?? EMPTY), ...patch }));

  const save = async (): Promise<void> => {
    if (!editing?.title.trim() || !editing?.content.trim()) {
      toaster.show({ type: 'error', title: t('service.manuals.required') });
      return;
    }
    setSaving(true);
    try {
      await api.saveManual(editing);
      toaster.show({ type: 'success', title: t('service.common.saved') });
      setEditing(undefined);
      manuals.reload();
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!removing) {
      return;
    }
    try {
      await api.deleteManual(removing.id);
      toaster.show({ type: 'success', title: t('service.common.deleted') });
      setRemoving(undefined);
      manuals.reload();
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
      setRemoving(undefined);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.manuals.title')}
        description={t('service.manuals.description')}
        actions={
          isSupervisor ? (
            <Button onClick={() => setEditing({ ...EMPTY })}>
              <Plus />
              {t('service.manuals.create')}
            </Button>
          ) : undefined
        }
      />

      {manuals.loading ? <PageLoading /> : null}
      {manuals.error ? (
        <ErrorState error={manuals.error} onRetry={manuals.reload} />
      ) : null}

      {!manuals.loading && !manuals.error ? (
        manuals.data && manuals.data.length > 0 ? (
          <div className='grid gap-4 md:grid-cols-2'>
            {manuals.data.map((manual) => (
              <div
                key={manual.id}
                className='flex flex-col gap-2 rounded-lg border border-border p-4'
              >
                <div className='flex items-center gap-2'>
                  <BookOpen className='size-4 text-muted-foreground' />
                  <h2 className='font-heading text-lg font-semibold'>
                    {manual.title}
                  </h2>
                </div>
                <p className='text-sm text-muted-foreground'>
                  {t('service.manuals.version')} {manual.version}
                  {manual.deviceModel ? ` · ${manual.deviceModel}` : ''}
                </p>
                <p className='text-xs text-muted-foreground'>
                  {t('service.manuals.updatedAt')}{' '}
                  {formatDateTime(manual.updatedAt)}
                </p>
                <div className='mt-2 flex flex-wrap gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setReading(manual)}
                  >
                    <BookOpen />
                    {t('service.manuals.read')}
                  </Button>
                  {isSupervisor ? (
                    <>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() =>
                          setEditing({
                            id: manual.id,
                            title: manual.title,
                            version: manual.version,
                            deviceModel: manual.deviceModel ?? '',
                            content: manual.content,
                            status: manual.status,
                          })
                        }
                      >
                        <Pencil />
                        {t('service.common.edit')}
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => setRemoving(manual)}
                      >
                        <Trash2 />
                        {t('service.common.delete')}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState />
        )
      ) : null}

      <Sheet
        open={Boolean(reading)}
        onOpenChange={(open) => !open && setReading(undefined)}
      >
        <SheetContent className='w-full overflow-y-auto sm:max-w-2xl'>
          <SheetHeader>
            <SheetTitle>{reading?.title}</SheetTitle>
            <SheetDescription>
              {reading
                ? `${t('service.manuals.version')} ${reading.version}`
                : ''}
            </SheetDescription>
          </SheetHeader>
          <div className='px-4 pb-8 text-sm whitespace-pre-wrap'>
            {reading?.content}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(undefined)}
      >
        <SheetContent className='w-full overflow-y-auto sm:max-w-xl'>
          <SheetHeader>
            <SheetTitle>
              {editing?.id
                ? t('service.manuals.editTitle')
                : t('service.manuals.create')}
            </SheetTitle>
          </SheetHeader>
          <div className='grid gap-4 px-4 pb-8'>
            <div className='grid gap-2'>
              <Label htmlFor='manual-title'>
                {t('service.manuals.manualTitle')}
              </Label>
              <Input
                id='manual-title'
                value={editing?.title ?? ''}
                onChange={(event) => update({ title: event.target.value })}
              />
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='grid gap-2'>
                <Label htmlFor='manual-version'>
                  {t('service.manuals.version')}
                </Label>
                <Input
                  id='manual-version'
                  value={editing?.version ?? ''}
                  onChange={(event) => update({ version: event.target.value })}
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='manual-model'>
                  {t('service.manuals.deviceModel')}
                </Label>
                <Input
                  id='manual-model'
                  value={editing?.deviceModel ?? ''}
                  onChange={(event) =>
                    update({ deviceModel: event.target.value })
                  }
                />
              </div>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='manual-content'>
                {t('service.manuals.content')}
              </Label>
              <Textarea
                id='manual-content'
                className='min-h-72 font-mono'
                value={editing?.content ?? ''}
                onChange={(event) => update({ content: event.target.value })}
              />
            </div>
            <div className='flex justify-end gap-2'>
              <Button variant='outline' onClick={() => setEditing(undefined)}>
                {t('actions.cancel')}
              </Button>
              <Button onClick={() => void save()} disabled={saving}>
                {t('actions.save')}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('service.manuals.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('service.manuals.deleteDescription', {
                title: removing?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>
              {t('service.common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
