import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Link } from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { BookOpenIcon, PlusIcon, SparklesIcon } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { EmptyState, ErrorState, LoadingState } from './components.js';
import {
  createManual,
  errorMessage,
  getAiManualStatus,
  listEquipment,
  listManuals,
  type AiManualStatus,
  type Equipment,
  type Manual,
} from './data.js';

interface FormState {
  title: string;
  version: string;
  equipmentId: string;
  summary: string;
  content: string;
  published: boolean;
}

const EMPTY_FORM: FormState = {
  title: '',
  version: '1.0',
  equipmentId: '',
  summary: '',
  content: '',
  published: true,
};

export default function ManualsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const [rows, setRows] = useState<Manual[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [aiStatus, setAiStatus] = useState<AiManualStatus>();
  const [aiError, setAiError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([listManuals(api), listEquipment(api)])
      .then(([manuals, equipmentPage]) => {
        if (controller.signal.aborted) return;
        setRows(manuals.items);
        setEquipment(equipmentPage.items);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(cause));
        setLoading(false);
      });
    return () => controller.abort();
  }, [api, revision]);

  // The manual list is the business data; the AI status is reported separately so a missing model or vector store
  // never hides the manuals a supervisor already maintained.
  useEffect(() => {
    const controller = new AbortController();
    getAiManualStatus(api)
      .then((status) => {
        if (controller.signal.aborted) return;
        setAiStatus(status);
        setAiError(undefined);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setAiError(errorMessage(cause));
      });
    return () => controller.abort();
  }, [api, revision]);

  const equipmentById = new Map(
    equipment.map((item) => [item.id, `${item.code} · ${item.name}`]),
  );

  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      await createManual(api, {
        title: form.title,
        version: form.version,
        equipmentId: Number(form.equipmentId),
        summary: form.summary || null,
        content: form.content || null,
        filename: null,
        published: form.published,
      });
      toaster.show({ type: 'success', title: t('service.manuals.saved') });
      setCreating(false);
      setForm(EMPTY_FORM);
      reload();
    } catch (cause: unknown) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnDef<Manual>[] = [
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('service.manuals.name')}
        />
      ),
      cell: ({ row }) => (
        <span className='flex items-center gap-2 font-medium'>
          <BookOpenIcon className='size-4 text-muted-foreground' />
          {row.original.title}
        </span>
      ),
    },
    {
      accessorKey: 'version',
      header: t('service.manuals.version'),
      cell: ({ row }) => row.original.version,
    },
    {
      accessorKey: 'equipmentId',
      header: t('service.manuals.equipment'),
      cell: ({ row }) =>
        equipmentById.get(row.original.equipmentId) ??
        `#${row.original.equipmentId}`,
    },
    {
      accessorKey: 'summary',
      header: t('service.manuals.summary'),
      cell: ({ row }) => (
        <span className='line-clamp-1 text-sm text-muted-foreground'>
          {row.original.summary ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'published',
      header: t('service.knowledge.published'),
      cell: ({ row }) =>
        row.original.published ? (
          <Badge variant='secondary'>
            {t('service.knowledge.publishedYes')}
          </Badge>
        ) : (
          <Badge variant='outline'>{t('service.knowledge.publishedNo')}</Badge>
        ),
    },
    {
      id: 'aiStatus',
      header: t('service.manuals.ai.status'),
      cell: ({ row }) => {
        // The real processing state of the document this manual was ingested as. A manual no knowledge base has
        // accepted is reported as not ingested, never as processed.
        const document = aiStatus?.documents.find(
          (item) =>
            item.title === row.original.title ||
            (item.filename !== null && item.filename === row.original.filename),
        );
        if (!document) {
          return (
            <Badge variant='outline'>
              {t('service.manuals.ai.notIngested')}
            </Badge>
          );
        }
        const failed =
          document.indexStatus === 'ERROR' ||
          document.segmentStatus === 'ERROR';
        return (
          <Badge variant={failed ? 'destructive' : 'secondary'}>
            {document.indexStatus}
          </Badge>
        );
      },
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('service.manuals.title')}
        description={t('service.manuals.description')}
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon />
            {t('service.manuals.create')}
          </Button>
        }
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('service.manuals.empty')} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => String(row.id)}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <SparklesIcon className='size-4' />
            {t('service.manuals.ai.title')}
          </CardTitle>
          <CardDescription>
            {t('service.manuals.ai.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-2 text-sm'>
          {aiError ? (
            <p role='alert' className='text-destructive'>
              {aiError}
            </p>
          ) : !aiStatus ? (
            <p role='status' className='text-muted-foreground'>
              {t('service.manuals.ai.loading')}
            </p>
          ) : aiStatus.restricted ? (
            <p className='text-muted-foreground'>
              {t('service.manuals.ai.restricted')}
            </p>
          ) : (
            <>
              <p>
                {aiStatus.ready
                  ? t('service.manuals.ai.ready')
                  : t('service.manuals.ai.notReady')}
              </p>
              <p className='text-muted-foreground'>
                {t('service.manuals.ai.bases', {
                  count: aiStatus.knowledgeBases.length,
                })}{' '}
                {t('service.manuals.ai.vectors', {
                  count: aiStatus.vectorDatabases,
                })}{' '}
                {t('service.manuals.ai.llms', { count: aiStatus.llmServices })}
              </p>
              {aiStatus.missing.length > 0 ? (
                <ul className='list-disc pl-5 text-muted-foreground'>
                  {aiStatus.missing.map((key) => (
                    <li key={key}>{t(key)}</li>
                  ))}
                </ul>
              ) : null}
              <Button
                variant='outline'
                size='sm'
                render={<Link to='/settings/ai/knowledge-base' />}
              >
                {t('service.manuals.ai.manage')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>{t('service.manuals.create')}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field>
                <FieldLabel htmlFor='manual-title'>
                  {t('service.manuals.name')}
                </FieldLabel>
                <Input
                  id='manual-title'
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='manual-version'>
                  {t('service.manuals.version')}
                </FieldLabel>
                <Input
                  id='manual-version'
                  value={form.version}
                  onChange={(event) =>
                    setForm({ ...form, version: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>{t('service.manuals.equipment')}</FieldLabel>
              <Select
                value={form.equipmentId}
                onValueChange={(equipmentId) =>
                  setForm({ ...form, equipmentId: equipmentId ?? '' })
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t('service.workOrders.selectEquipment')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {equipment.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.code} · {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor='manual-summary'>
                {t('service.manuals.summary')}
              </FieldLabel>
              <Textarea
                id='manual-summary'
                rows={2}
                value={form.summary}
                onChange={(event) =>
                  setForm({ ...form, summary: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='manual-content'>
                {t('service.manuals.content')}
              </FieldLabel>
              <Textarea
                id='manual-content'
                rows={5}
                value={form.content}
                onChange={(event) =>
                  setForm({ ...form, content: event.target.value })
                }
              />
            </Field>
            <label className='flex items-center gap-2 text-sm'>
              <Checkbox
                checked={form.published}
                onCheckedChange={(checked) =>
                  setForm({ ...form, published: checked === true })
                }
              />
              {t('service.knowledge.publishedYes')}
            </label>
          </FieldGroup>
          <DialogFooter>
            <Button variant='outline' onClick={() => setCreating(false)}>
              {t('actions.cancel')}
            </Button>
            <Button
              disabled={busy || !form.title || !form.equipmentId}
              onClick={() => void save()}
            >
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
