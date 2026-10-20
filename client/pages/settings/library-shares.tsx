import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { LockIcon, Share2Icon, XIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import { useLibraryData } from '../library/use-library-data.js';
import type {
  LibraryAdminDocument,
  LibraryAdminUser,
  LibraryListResponse,
  LibraryShare,
} from '../library/types.js';

export default function LibrarySharesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const documents = useLibraryData<LibraryListResponse<LibraryAdminDocument>>(
    'library/admin/documents?page=1&pageSize=100',
  );
  const users = useLibraryData<LibraryListResponse<LibraryAdminUser>>(
    'library/admin/users',
  );
  const [documentId, setDocumentId] = useState('');
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = documents.data?.data.find(
    (document) => document.id === documentId,
  );
  const share = async () => {
    if (!documentId || !userId || busy) return;
    setBusy(true);
    try {
      await api.request<{ data: LibraryShare }>({
        path: 'library/shares',
        method: 'POST',
        json: { documentId, userId },
      });
      toaster.show({ type: 'success', title: t('library.admin.shared') });
      setUserId('');
      documents.reload();
    } catch {
      toaster.show({
        type: 'error',
        title: t('library.admin.shareFailed'),
      });
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (id: string) => {
    setBusy(true);
    try {
      await api.request({
        path: `library/shares/${encodeURIComponent(id)}`,
        method: 'DELETE',
      });
      toaster.show({ type: 'success', title: t('library.admin.revoked') });
      documents.reload();
    } catch {
      toaster.show({ type: 'error', title: t('library.admin.revokeFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('library.admin.title')}
        description={t('library.admin.description')}
      />
      <section className='flex flex-col gap-4 rounded-xl border bg-card p-5'>
        <div className='flex items-center gap-2'>
          <Share2Icon className='size-4 text-primary' />
          <h2 className='font-heading text-base font-medium'>
            {t('library.admin.grantTitle')}
          </h2>
        </div>
        <p className='text-sm text-muted-foreground'>
          {t('library.admin.grantHint')}
        </p>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='flex flex-col gap-2'>
            <Label>{t('library.admin.document')}</Label>
            <Select
              items={(documents.data?.data ?? []).map((document) => ({
                value: document.id,
                label: document.title,
              }))}
              value={documentId}
              onValueChange={(next) => {
                if (next !== null) setDocumentId(next);
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder={t('library.admin.chooseDocument')} />
              </SelectTrigger>
              <SelectContent>
                {(documents.data?.data ?? []).map((document) => (
                  <SelectItem key={document.id} value={document.id}>
                    {document.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='flex flex-col gap-2'>
            <Label>{t('library.admin.person')}</Label>
            <Select
              items={(users.data?.data ?? []).map((user) => ({
                value: user.id,
                label: `${user.name} · ${user.email}`,
              }))}
              value={userId}
              onValueChange={(next) => {
                if (next !== null) setUserId(next);
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder={t('library.admin.choosePerson')} />
              </SelectTrigger>
              <SelectContent>
                {(users.data?.data ?? []).map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} · {user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {selected?.confidential ? (
          <p className='text-sm text-destructive'>
            {t('library.admin.confidentialWarning')}
          </p>
        ) : null}
        <div>
          <Button
            disabled={
              !documentId || !userId || busy || selected?.confidential === true
            }
            onClick={() => void share()}
          >
            <Share2Icon />
            {busy ? t('library.admin.saving') : t('library.admin.share')}
          </Button>
        </div>
      </section>

      {documents.loading && !documents.data ? (
        <Skeleton className='h-56 w-full rounded-xl' />
      ) : (
        <div className='flex flex-col gap-4'>
          {(documents.data?.data ?? []).map((document) => (
            <Card key={document.id}>
              <CardHeader>
                <div className='flex flex-wrap items-center gap-2'>
                  <Badge variant={document.published ? 'secondary' : 'outline'}>
                    {document.published
                      ? t('library.status.published')
                      : t('library.status.draft')}
                  </Badge>
                  {document.confidential ? (
                    <Badge variant='destructive'>
                      <LockIcon />
                      {t('library.status.confidential')}
                    </Badge>
                  ) : null}
                </div>
                <CardTitle>{document.title}</CardTitle>
                <CardDescription>
                  {t('library.byOwner', { name: document.ownerName })}
                </CardDescription>
              </CardHeader>
              <CardContent className='flex flex-col gap-3'>
                {document.shares.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>
                    {t('library.admin.noShares')}
                  </p>
                ) : (
                  document.shares.map((item) => (
                    <div
                      key={item.id}
                      className='flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2'
                    >
                      <div className='min-w-0'>
                        <p className='text-sm font-medium'>{item.userName}</p>
                        <p className='text-xs text-muted-foreground'>
                          {item.userEmail}
                        </p>
                      </div>
                      <Button
                        variant='ghost'
                        size='sm'
                        disabled={busy}
                        onClick={() => void revoke(item.id)}
                      >
                        <XIcon />
                        {t('library.admin.revoke')}
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
