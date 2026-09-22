import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  createFieldVisit,
  listFieldVisits,
  updateFieldVisit,
  type FieldVisit,
  type FieldVisitConclusion,
  type FieldVisitDraft,
} from './api.js';
import { FieldVisitFormDialog } from './field-visit-form.js';

export default function FieldVisitsPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();

  const [records, setRecords] = useState<readonly FieldVisit[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FieldVisit | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // Debounce the search so each keystroke does not issue its own request.
    const timer = setTimeout(
      () => {
        setLoading(true);
        setLoadFailed(false);
        listFieldVisits(api, search, controller.signal)
          .then((result) => {
            if (controller.signal.aborted) {
              return;
            }
            setRecords(result.records);
            setTotal(result.total);
          })
          .catch(() => {
            if (!controller.signal.aborted) {
              setLoadFailed(true);
            }
          })
          .finally(() => {
            if (!controller.signal.aborted) {
              setLoading(false);
            }
          });
      },
      search ? 250 : 0,
    );

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [api, search, reloadToken]);

  function openCreate(): void {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(record: FieldVisit): void {
    setEditing(record);
    setFormOpen(true);
  }

  async function handleSubmit(draft: FieldVisitDraft): Promise<void> {
    if (editing) {
      await updateFieldVisit(api, editing.id, draft);
    } else {
      await createFieldVisit(api, draft);
    }
    setReloadToken((token) => token + 1);
  }

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        actions={
          <Button onClick={openCreate}>
            <PlusIcon />
            {t('fieldVisits.create')}
          </Button>
        }
        description={t('fieldVisits.description')}
        title={t('fieldVisits.title')}
      />

      <Card>
        <CardHeader>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='relative w-full sm:max-w-xs'>
              <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                aria-label={t('fieldVisits.searchLabel')}
                className='pl-8'
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('fieldVisits.searchPlaceholder')}
                value={search}
              />
            </div>
            <p className='text-sm text-muted-foreground'>
              {t('fieldVisits.count', { count: total })}
            </p>
          </div>
        </CardHeader>

        <CardContent className='p-0'>
          {renderTableContent({
            loading,
            loadFailed,
            records,
            onRetry: () => setReloadToken((token) => token + 1),
            onEdit: openEdit,
            t,
          })}
        </CardContent>
      </Card>

      {formOpen ? (
        <FieldVisitFormDialog
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmit}
          record={editing}
        />
      ) : null}
    </PageContainer>
  );
}

interface TableContentOptions {
  readonly loading: boolean;
  readonly loadFailed: boolean;
  readonly records: readonly FieldVisit[];
  readonly onRetry: () => void;
  readonly onEdit: (record: FieldVisit) => void;
  readonly t: (key: string, options?: Record<string, unknown>) => string;
}

function renderTableContent({
  loading,
  loadFailed,
  records,
  onRetry,
  onEdit,
  t,
}: TableContentOptions): ReactElement {
  if (loading) {
    return (
      <div className='flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground'>
        <Spinner />
        {t('fieldVisits.loading')}
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className='flex flex-col items-center gap-3 p-8'>
        <p className='text-sm text-destructive'>
          {t('fieldVisits.loadFailed')}
        </p>
        <Button onClick={onRetry} size='sm' variant='outline'>
          {t('status.retry')}
        </Button>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <p className='p-8 text-center text-sm text-muted-foreground'>
        {t('fieldVisits.empty')}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('fieldVisits.customerName')}</TableHead>
          <TableHead>{t('fieldVisits.visitDate')}</TableHead>
          <TableHead>{t('fieldVisits.conclusion')}</TableHead>
          <TableHead>{t('fieldVisits.engineerName')}</TableHead>
          <TableHead className='text-right'>
            {t('fieldVisits.actions')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((record) => (
          <TableRow key={record.id}>
            <TableCell className='font-medium'>{record.customerName}</TableCell>
            <TableCell>{record.visitDate}</TableCell>
            <TableCell>
              <Badge variant={conclusionVariant(record.conclusion)}>
                {t(`fieldVisits.conclusions.${record.conclusion}`)}
              </Badge>
            </TableCell>
            <TableCell>
              {record.engineerName ?? t('fieldVisits.noEngineer')}
            </TableCell>
            <TableCell className='text-right'>
              <Button
                onClick={() => onEdit(record)}
                size='sm'
                variant='outline'
              >
                {t('fieldVisits.editAction')}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function conclusionVariant(
  conclusion: FieldVisitConclusion,
): 'default' | 'secondary' | 'destructive' {
  if (conclusion === 'satisfied') {
    return 'default';
  }
  if (conclusion === 'dissatisfied') {
    return 'destructive';
  }
  return 'secondary';
}
