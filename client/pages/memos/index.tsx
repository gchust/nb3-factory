import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { MemoDeleteDialog } from './memo-delete-dialog.js';
import { MemoFormDialog } from './memo-form-dialog.js';
import type { CustomerMemo, MemoFormValues } from './types.js';

type LoadStatus = 'loading' | 'ready' | 'error';

interface FormDialogState {
  readonly open: boolean;
  readonly memo: CustomerMemo | null;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (part: number) => String(part).padStart(2, '0');
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(' ');
}

/**
 * Customer memo page: list, create, edit, search and delete against the memo
 * API. The page owns the request lifecycle; the dialogs own only their form
 * state.
 */
export default function CustomerMemosPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const [memos, setMemos] = useState<readonly CustomerMemo[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [reloadToken, setReloadToken] = useState(0);
  const [formDialog, setFormDialog] = useState<FormDialogState>({
    open: false,
    memo: null,
  });
  const [deleteTarget, setDeleteTarget] = useState<CustomerMemo | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const search = query.trim();

    void api
      .request<{ data: CustomerMemo[] }>({
        path: 'memos',
        signal: controller.signal,
        ...(search ? { query: { search } } : {}),
      })
      .then(({ data }) => {
        if (controller.signal.aborted) {
          return;
        }
        setMemos(data);
        setStatus('ready');
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }
        setStatus('error');
      });

    return () => controller.abort();
  }, [api, query, reloadToken]);

  const reload = useCallback(() => {
    setStatus('loading');
    setReloadToken((value) => value + 1);
  }, []);

  async function handleSubmit(values: MemoFormValues): Promise<void> {
    const editing = formDialog.memo;
    if (editing) {
      await api.request({
        path: `memos/${editing.id}`,
        method: 'PATCH',
        json: values,
      });
    } else {
      await api.request({ path: 'memos', method: 'POST', json: values });
    }
    setFormDialog({ open: false, memo: null });
    reload();
  }

  async function handleConfirmDelete(memo: CustomerMemo): Promise<void> {
    await api.request<void>({ path: `memos/${memo.id}`, method: 'DELETE' });
    setDeleteTarget(null);
    reload();
  }

  const trimmedQuery = query.trim();

  return (
    <PageContainer>
      <PageHeader
        title={t('memos.title')}
        description={t('memos.description')}
        actions={
          <Button onClick={() => setFormDialog({ open: true, memo: null })}>
            <PlusIcon />
            {t('memos.add')}
          </Button>
        }
      />

      <div className='max-w-sm space-y-2'>
        <Label htmlFor='memo-search'>{t('memos.searchLabel')}</Label>
        <Input
          id='memo-search'
          type='search'
          value={query}
          placeholder={t('memos.searchPlaceholder')}
          onChange={(event) => {
            setStatus('loading');
            setQuery(event.target.value);
          }}
        />
      </div>

      <Card>
        <CardContent className='px-0'>
          {status === 'loading' ? (
            <div className='flex items-center justify-center gap-2 p-10 text-muted-foreground'>
              <Spinner />
              {t('status.loading')}
            </div>
          ) : null}

          {status === 'error' ? (
            <div className='space-y-3 p-10 text-center'>
              <p className='text-sm text-destructive'>
                {t('memos.loadFailed')}
              </p>
              <Button variant='outline' onClick={reload}>
                {t('status.retry')}
              </Button>
            </div>
          ) : null}

          {status === 'ready' && memos.length === 0 ? (
            <p className='p-10 text-center text-sm text-muted-foreground'>
              {trimmedQuery
                ? t('memos.noResults', { query: trimmedQuery })
                : t('memos.empty')}
            </p>
          ) : null}

          {status === 'ready' && memos.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('memos.customerName')}</TableHead>
                  <TableHead>{t('memos.content')}</TableHead>
                  <TableHead>{t('memos.createdAt')}</TableHead>
                  <TableHead className='text-right'>
                    {t('memos.actions')}
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
                      {memo.content ?? '—'}
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {formatDateTime(memo.createdAt)}
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='flex justify-end gap-1'>
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          aria-label={t('memos.editLabel', {
                            name: memo.customerName,
                          })}
                          onClick={() => setFormDialog({ open: true, memo })}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          className='text-destructive hover:text-destructive'
                          aria-label={t('memos.deleteLabel', {
                            name: memo.customerName,
                          })}
                          onClick={() => setDeleteTarget(memo)}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <MemoFormDialog
        key={formDialog.open ? (formDialog.memo?.id ?? 'new') : 'closed'}
        open={formDialog.open}
        memo={formDialog.memo}
        onOpenChange={(open) =>
          setFormDialog({ open, memo: open ? formDialog.memo : null })
        }
        onSubmit={handleSubmit}
      />
      <MemoDeleteDialog
        key={deleteTarget?.id ?? 'closed'}
        open={deleteTarget !== null}
        memo={deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={handleConfirmDelete}
      />
    </PageContainer>
  );
}
