import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
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

import { listCustomerMemos, type CustomerMemo } from './api.js';
import { CustomerMemoDeleteDialog } from './delete-dialog.js';
import { CustomerMemoFormDialog } from './memo-form-dialog.js';

type ListStatus = 'loading' | 'ready' | 'error';

export default function CustomerMemosPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();

  const [memos, setMemos] = useState<CustomerMemo[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ListStatus>('loading');
  const [reloadToken, setReloadToken] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerMemo | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CustomerMemo | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void listCustomerMemos(api, search, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) {
          return;
        }

        setMemos(data);
        setStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus('error');
        }
      });

    return () => controller.abort();
  }, [api, search, reloadToken]);

  const reload = () => {
    setStatus('loading');
    setReloadToken((token) => token + 1);
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (memo: CustomerMemo) => {
    setEditing(memo);
    setFormOpen(true);
  };

  const formatDate = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  return (
    <PageContainer className='mx-auto max-w-5xl'>
      <PageHeader
        actions={
          <Button onClick={openCreate}>
            <Plus />
            {t('customerMemos.create')}
          </Button>
        }
        title={t('customerMemos.title')}
      />

      <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
        <div className='relative w-full sm:max-w-sm'>
          <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            aria-label={t('customerMemos.searchLabel')}
            className='pl-8'
            onChange={(event) => {
              setStatus('loading');
              setSearch(event.target.value);
            }}
            placeholder={t('customerMemos.searchPlaceholder')}
            value={search}
          />
        </div>
        {search ? (
          <Button
            onClick={() => {
              setStatus('loading');
              setSearch('');
            }}
            variant='ghost'
          >
            {t('customerMemos.clearSearch')}
          </Button>
        ) : null}
      </div>

      {status === 'loading' ? (
        <div className='flex items-center gap-2 py-10 text-sm text-muted-foreground'>
          <Spinner />
          {t('customerMemos.loading')}
        </div>
      ) : null}

      {status === 'error' ? (
        <div className='flex flex-col items-start gap-3 py-10'>
          <p className='text-sm text-destructive'>
            {t('customerMemos.loadFailed')}
          </p>
          <Button onClick={reload} variant='outline'>
            {t('customerMemos.retry')}
          </Button>
        </div>
      ) : null}

      {status === 'ready' && memos.length === 0 ? (
        <p className='py-10 text-sm text-muted-foreground'>
          {search.trim()
            ? t('customerMemos.noResults')
            : t('customerMemos.empty')}
        </p>
      ) : null}

      {status === 'ready' && memos.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('customerMemos.customerName')}</TableHead>
              <TableHead>{t('customerMemos.note')}</TableHead>
              <TableHead>{t('customerMemos.createdAt')}</TableHead>
              <TableHead className='text-right'>
                {t('customerMemos.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {memos.map((memo) => (
              <TableRow key={memo.id}>
                <TableCell className='font-medium'>
                  {memo.customerName}
                </TableCell>
                <TableCell className='max-w-md whitespace-normal text-muted-foreground'>
                  {memo.note ?? t('customerMemos.noNote')}
                </TableCell>
                <TableCell className='text-muted-foreground'>
                  {formatDate(memo.createdAt)}
                </TableCell>
                <TableCell className='text-right'>
                  <Button
                    aria-label={t('customerMemos.edit')}
                    onClick={() => openEdit(memo)}
                    size='icon-sm'
                    variant='ghost'
                  >
                    <Pencil />
                  </Button>
                  <Button
                    aria-label={t('customerMemos.delete')}
                    onClick={() => setPendingDelete(memo)}
                    size='icon-sm'
                    variant='ghost'
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {formOpen ? (
        <CustomerMemoFormDialog
          memo={editing}
          onOpenChange={setFormOpen}
          onSaved={reload}
          open={formOpen}
        />
      ) : null}
      <CustomerMemoDeleteDialog
        memo={pendingDelete}
        onDeleted={reload}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        open={pendingDelete !== null}
      />
    </PageContainer>
  );
}
