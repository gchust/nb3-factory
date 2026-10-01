import { useToaster, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  FileTextIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
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
  serviceRequest,
  useServiceResource,
  type Manual,
  type ServicePrincipal,
} from './model.js';
import {
  deleteManualDocuments,
  ingestManual,
  loadManualsKnowledgeBaseStatuses,
  reprocessManual,
  type KnowledgeBaseDocumentStatus,
} from './manual-knowledge.js';
import { ErrorState, LoadingState } from './shared.js';

const STATUS_VARIANTS: Readonly<
  Record<string, 'default' | 'secondary' | 'destructive' | 'outline'>
> = {
  pending: 'outline',
  available: 'default',
  failed: 'destructive',
};

// The knowledge base reports uppercase processing states; the manual library
// reports lowercase availability. They are separate axes: a manual an engineer
// can read may still have failed to index for retrieval.
const PROCESSING_VARIANTS: Readonly<
  Record<string, 'default' | 'secondary' | 'destructive' | 'outline'>
> = {
  PENDING: 'outline',
  SUCCESS: 'default',
  ERROR: 'destructive',
};

export default function ManualsPage(): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const api = useApiClient();
  const manuals = useServiceResource<Manual[]>('manuals');
  const principal = useServiceResource<ServicePrincipal>('me');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Manual | null>(null);
  const [failing, setFailing] = useState<Manual | null>(null);
  const [pending, setPending] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [title, setTitle] = useState('');
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [failureReason, setFailureReason] = useState('');

  // The knowledge base processing state is read per document and keyed by the
  // manual's stored documentId, so the page shows the platform's real result
  // rather than inferring one from the manual's own availability.
  const [knowledgeBaseStatus, setKnowledgeBaseStatus] = useState<
    Record<string, KnowledgeBaseDocumentStatus>
  >({});
  const reconciledRef = useRef(false);

  // Only a supervisor maintains the library; engineers and observers read the
  // manuals that have been made available. The server enforces this too, but
  // the page must not offer actions the account cannot perform.
  const isAdmin = principal.data?.roles.admin ?? false;

  const reloadAfter = useCallback(() => manuals.reload(), [manuals]);

  const refreshKnowledgeBase = useCallback(async () => {
    setKnowledgeBaseStatus(await loadManualsKnowledgeBaseStatuses());
  }, []);

  // Upload manuals the library holds but the knowledge base has not received
  // yet and record the returned document link. This runs once per loaded list
  // for a supervisor, so the seeded manuals are genuinely wired on the first
  // visit instead of carrying empty references forever.
  const reconcile = useCallback(
    async (rows: Manual[]) => {
      const unlinked = rows.filter(
        (manual) => !manual.documentId && manual.content?.trim(),
      );
      if (!unlinked.length) return;
      setProcessing(true);
      try {
        for (const manual of unlinked) {
          const link = await ingestManual(manual);
          await serviceRequest(api, `manuals/${manual.id}`, {
            method: 'PUT',
            json: link,
          });
        }
        await refreshKnowledgeBase();
        reloadAfter();
      } catch (cause) {
        toaster.show({
          type: 'error',
          title: t('service.manuals.processingFailed'),
          description: cause instanceof Error ? cause.message : String(cause),
        });
      } finally {
        setProcessing(false);
      }
    },
    [api, refreshKnowledgeBase, reloadAfter, t, toaster],
  );

  useEffect(() => {
    if (!isAdmin || !manuals.data || reconciledRef.current) return;
    reconciledRef.current = true;
    void refreshKnowledgeBase();
    void reconcile(manuals.data);
  }, [isAdmin, manuals.data, reconcile, refreshKnowledgeBase]);

  const setManualStatus = useCallback(
    async (manual: Manual, status: 'available' | 'failed', reason?: string) => {
      setPending(true);
      try {
        await serviceRequest(api, `manuals/${manual.id}`, {
          method: 'PUT',
          json:
            status === 'failed'
              ? { status, failureReason: reason }
              : { status: 'available', failureReason: null },
        });
        toaster.show({ type: 'success', title: t('service.saved') });
        setFailing(null);
        setFailureReason('');
        reloadAfter();
      } catch (cause) {
        toaster.show({
          type: 'error',
          title: t('service.saveFailed'),
          description: cause instanceof Error ? cause.message : String(cause),
        });
      } finally {
        setPending(false);
      }
    },
    [api, reloadAfter, t, toaster],
  );

  // Re-runs knowledge base processing after the deployment's embedding service
  // or vector database changed, then records the new real state.
  const reprocess = useCallback(
    async (manual: Manual) => {
      setProcessing(true);
      try {
        await reprocessManual(manual);
        await refreshKnowledgeBase();
        toaster.show({
          type: 'success',
          title: t('service.manuals.processingQueued'),
        });
      } catch (cause) {
        toaster.show({
          type: 'error',
          title: t('service.manuals.processingFailed'),
          description: cause instanceof Error ? cause.message : String(cause),
        });
      } finally {
        setProcessing(false);
      }
    },
    [refreshKnowledgeBase, t, toaster],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleting) return;
    setPending(true);
    try {
      // Remove the knowledge base document first, best effort: the manual must
      // still be deletable if the document is already gone or the base is
      // unavailable, and a stray document would keep the manual in retrieval.
      if (deleting.documentId) {
        try {
          await deleteManualDocuments([deleting.documentId]);
        } catch {
          // Best effort; the manual delete below is the action the user chose.
        }
      }
      await serviceRequest(api, `manuals/${deleting.id}`, {
        method: 'DELETE',
      });
      toaster.show({ type: 'success', title: t('service.deleted') });
      setDeleting(null);
      reloadAfter();
      void refreshKnowledgeBase();
    } catch (cause) {
      toaster.show({
        type: 'error',
        title: t('service.deleteFailed'),
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setPending(false);
    }
  }, [api, deleting, refreshKnowledgeBase, reloadAfter, t, toaster]);

  const columns = useMemo<ColumnDef<Manual>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.manuals.title')}
          />
        ),
        cell: ({ row }) => (
          <span className='flex items-center gap-2 font-medium'>
            <FileTextIcon className='size-4 text-muted-foreground' />
            {row.original.title}
          </span>
        ),
      },
      {
        accessorKey: 'filename',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.manuals.filename')}
          />
        ),
        cell: ({ row }) => row.original.filename ?? '—',
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.manuals.status')}
          />
        ),
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANTS[row.original.status] ?? 'outline'}>
            {t(`service.manuals.statusValue.${row.original.status}` as never)}
          </Badge>
        ),
      },
      {
        accessorKey: 'failureReason',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.manuals.failureReason')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-sm text-muted-foreground'>
            {row.original.failureReason ?? '—'}
          </span>
        ),
      },
      ...(isAdmin
        ? [
            {
              id: 'knowledgeBase',
              header: () => t('service.manuals.processingStatus'),
              enableHiding: false,
              cell: ({ row }: { row: { original: Manual } }) => {
                if (!row.original.documentId) {
                  return (
                    <span className='text-sm text-muted-foreground'>
                      {t('service.manuals.notLinked')}
                    </span>
                  );
                }
                const result = knowledgeBaseStatus[row.original.documentId];
                if (!result) {
                  return (
                    <span className='text-sm text-muted-foreground'>—</span>
                  );
                }
                return (
                  <div className='flex flex-col gap-1'>
                    <Badge
                      variant={PROCESSING_VARIANTS[result.status] ?? 'outline'}
                    >
                      {t(
                        `service.manuals.processing.${result.status}` as never,
                      )}
                    </Badge>
                    {result.errorMessage ? (
                      <span className='text-xs text-muted-foreground'>
                        {result.errorMessage}
                      </span>
                    ) : null}
                  </div>
                );
              },
            } satisfies ColumnDef<Manual>,
          ]
        : []),
      ...(isAdmin
        ? [
            {
              id: 'actions',
              header: () => (
                <span className='sr-only'>{t('service.actions')}</span>
              ),
              enableHiding: false,
              cell: ({ row }: { row: { original: Manual } }) => (
                <div className='flex items-center justify-end gap-2'>
                  {knowledgeBaseStatus[row.original.documentId ?? '']
                    ?.status === 'ERROR' ? (
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={processing}
                      onClick={() => void reprocess(row.original)}
                    >
                      <RefreshCwIcon data-icon='inline-start' />
                      {t('service.manuals.reprocess')}
                    </Button>
                  ) : null}
                  {row.original.status === 'available' ? null : (
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={pending}
                      onClick={() =>
                        void setManualStatus(row.original, 'available')
                      }
                    >
                      {t('service.manuals.markAvailable')}
                    </Button>
                  )}
                  {row.original.status === 'failed' ? null : (
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={pending}
                      onClick={() => {
                        setFailureReason('');
                        setFailing(row.original);
                      }}
                    >
                      {t('service.manuals.markFailed')}
                    </Button>
                  )}
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('service.delete')}
                    onClick={() => setDeleting(row.original)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ),
            } satisfies ColumnDef<Manual>,
          ]
        : []),
    ],
    [
      isAdmin,
      knowledgeBaseStatus,
      pending,
      processing,
      reprocess,
      setManualStatus,
      t,
    ],
  );

  const submit = async (): Promise<void> => {
    if (!title.trim()) return;
    setPending(true);
    try {
      const created = await serviceRequest<Manual>(api, 'manuals', {
        method: 'POST',
        json: {
          title,
          filename: filename || null,
          content: content || null,
        },
      });
      // Upload the new manual into the knowledge base immediately and record
      // the real document, so the row shows genuine processing state instead
      // of a status the UI wrote without any indexing step behind it.
      if (created?.id && (content || '').trim()) {
        try {
          const link = await ingestManual(created);
          await serviceRequest(api, `manuals/${created.id}`, {
            method: 'PUT',
            json: link,
          });
          await refreshKnowledgeBase();
        } catch (cause) {
          toaster.show({
            type: 'error',
            title: t('service.manuals.processingFailed'),
            description: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
      toaster.show({ type: 'success', title: t('service.saved') });
      setCreating(false);
      setTitle('');
      setFilename('');
      setContent('');
      reloadAfter();
    } catch (cause) {
      toaster.show({
        type: 'error',
        title: t('service.saveFailed'),
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('navigation.manuals')}
        description={t('service.manuals.description')}
        actions={
          isAdmin ? (
            <Button type='button' onClick={() => setCreating(true)}>
              <PlusIcon data-icon='inline-start' />
              {t('service.manuals.create')}
            </Button>
          ) : null
        }
      />

      {isAdmin ? (
        <p className='text-sm text-muted-foreground'>
          {t('service.manuals.availabilityHint')}
        </p>
      ) : null}

      {manuals.loading ? (
        <LoadingState />
      ) : manuals.error ? (
        <ErrorState message={manuals.error} onRetry={manuals.reload} />
      ) : (
        <DataTable
          columns={columns}
          data={manuals.data ?? []}
          getRowId={(row) => row.id}
          toolbar={(table) => <DataTableViewOptions table={table} />}
          emptyMessage={t('service.empty')}
        />
      )}

      {creating ? (
        <Dialog open onOpenChange={(open) => !open && setCreating(false)}>
          <DialogContent className='sm:max-w-lg'>
            <DialogHeader>
              <DialogTitle>{t('service.manuals.create')}</DialogTitle>
              <DialogDescription>
                {t('service.manuals.formDescription')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-2'>
              <Field>
                <FieldLabel htmlFor='manual-title'>
                  {t('service.manuals.title')}
                </FieldLabel>
                <Input
                  id='manual-title'
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='manual-filename'>
                  {t('service.manuals.filename')}
                </FieldLabel>
                <Input
                  id='manual-filename'
                  value={filename}
                  onChange={(event) => setFilename(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='manual-content'>
                  {t('service.manuals.content')}
                </FieldLabel>
                <Textarea
                  id='manual-content'
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setCreating(false)}
              >
                {t('service.cancel')}
              </Button>
              <Button
                type='button'
                onClick={() => void submit()}
                disabled={pending || !title.trim()}
              >
                {pending ? t('service.saving') : t('service.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {failing ? (
        <Dialog open onOpenChange={(open) => !open && setFailing(null)}>
          <DialogContent className='sm:max-w-lg'>
            <DialogHeader>
              <DialogTitle>{t('service.manuals.markFailed')}</DialogTitle>
              <DialogDescription>
                {t('service.manuals.failureReasonRequired')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-2'>
              <Field>
                <FieldLabel htmlFor='manual-failure-reason'>
                  {t('service.manuals.failureReason')}
                </FieldLabel>
                <Textarea
                  id='manual-failure-reason'
                  value={failureReason}
                  placeholder={t('service.manuals.failureReasonPlaceholder')}
                  onChange={(event) => setFailureReason(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setFailing(null)}
              >
                {t('service.cancel')}
              </Button>
              <Button
                type='button'
                variant='destructive'
                disabled={pending || !failureReason.trim()}
                onClick={() =>
                  void setManualStatus(failing, 'failed', failureReason.trim())
                }
              >
                {pending
                  ? t('service.saving')
                  : t('service.manuals.markFailed')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('service.manuals.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('service.manuals.deleteDescription', {
                title: deleting?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('service.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => void confirmDelete()}
              disabled={pending}
            >
              {t('service.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
