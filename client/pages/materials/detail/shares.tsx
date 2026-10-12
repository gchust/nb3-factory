import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { UsersClient } from '@nocobase/app-plugin-users/client/user-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, InfoIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { type ReactElement, useEffect, useReducer, useState } from 'react';
import { useParams } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Separator } from '#components/ui/separator';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import { useRouteOverlay } from '#components/use-route-overlay';

import type { Material, MaterialSharesResponse } from '../types.js';

/**
 * `/materials/:materialId/shares`: opens one specific material to one person, temporarily. Confidential materials are
 * never readable this way, and opening a material gives read access only, never edit.
 */
export default function MaterialSharesPage(): ReactElement {
  const { materialId = '' } = useParams();
  return <MaterialShares key={materialId} materialId={materialId} />;
}

function MaterialShares({
  materialId,
}: {
  readonly materialId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = `${materialId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly shares?: MaterialSharesResponse['data'];
    readonly candidates?: { readonly userId: string; readonly name: string }[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${materialId}:${reloadCount}`;
    const usersClient = new UsersClient(api);
    Promise.all([
      api.request<MaterialSharesResponse>({
        path: `materials/${encodeURIComponent(materialId)}/shares`,
        signal: controller.signal,
      }),
      api.request<{ data: Material }>({
        path: `materials/${encodeURIComponent(materialId)}`,
        signal: controller.signal,
      }),
      usersClient.list({ pageSize: 100 }),
    ]).then(
      ([sharesResponse, materialResponse, userPage]) => {
        if (controller.signal.aborted) return;
        const shared = new Set(
          sharesResponse.data.map((share) => share.userId),
        );
        // The owner already has access, and a person already listed needs no second entry.
        const candidates = userPage.items
          .filter(
            (user) =>
              user.id !== materialResponse.data.ownerId && !shared.has(user.id),
          )
          .map((user) => ({ userId: user.id, name: user.name || user.email }));
        setResult({ key, shares: sharesResponse.data, candidates });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, materialId, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const shares = loading ? undefined : result?.shares;
  const candidates = loading ? undefined : result?.candidates;

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | undefined>();
  const [actionFailed, setActionFailed] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const candidateItems = (candidates ?? []).map((candidate) => ({
    value: candidate.userId,
    label: candidate.name,
  }));

  function noteFailure(requestError: unknown): void {
    if (requestError instanceof ApiClientError && requestError.status === 401) {
      setSessionExpired(true);
    } else {
      setActionFailed(true);
    }
  }

  async function handleAdd(): Promise<void> {
    if (!selectedUserId) return;
    setAdding(true);
    setActionFailed(false);
    try {
      await api.request({
        path: `materials/${encodeURIComponent(materialId)}/shares`,
        method: 'POST',
        json: { userId: selectedUserId },
      });
    } catch (requestError: unknown) {
      noteFailure(requestError);
      return;
    } finally {
      setAdding(false);
    }
    toaster.show({ type: 'success', title: t('materials.shares.add.success') });
    setSelectedUserId(null);
    reload();
  }

  async function handleRemove(userId: string): Promise<void> {
    setRemovingUserId(userId);
    setActionFailed(false);
    try {
      await api.request({
        path: `materials/${encodeURIComponent(materialId)}/shares/${encodeURIComponent(userId)}`,
        method: 'DELETE',
      });
    } catch (requestError: unknown) {
      noteFailure(requestError);
      return;
    } finally {
      setRemovingUserId(undefined);
    }
    toaster.show({
      type: 'success',
      title: t('materials.shares.remove.success'),
    });
    reload();
  }

  let body: ReactElement;
  if (status === 401) {
    body = <SessionExpiredAlert />;
  } else if (status === 404 || status === 403) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {status === 404
            ? t('materials.error.notFound')
            : t('materials.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('materials.error.requestFailed')}
        </AlertDescription>
      </Alert>
    );
  } else if (!shares || !candidates) {
    body = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-3'
      >
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-12 w-full' />
        <Skeleton className='h-12 w-full' />
      </div>
    );
  } else {
    body = (
      <div className='space-y-5 text-sm'>
        {sessionExpired ? <SessionExpiredAlert /> : null}
        <Alert>
          <InfoIcon />
          <AlertDescription>{t('materials.shares.hint')}</AlertDescription>
        </Alert>
        {candidateItems.length > 0 ? (
          <div className='flex flex-wrap items-center gap-2'>
            <Select
              items={candidateItems}
              value={selectedUserId}
              onValueChange={(value) => setSelectedUserId(value)}
            >
              <SelectTrigger
                className='min-w-0 flex-1'
                aria-label={t('materials.shares.selectUser')}
              >
                <SelectValue
                  placeholder={t('materials.shares.selectUserPlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {candidateItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              type='button'
              disabled={!selectedUserId || adding}
              onClick={() => void handleAdd()}
            >
              {adding ? <Spinner data-icon='inline-start' /> : <PlusIcon />}
              {adding
                ? t('materials.shares.add.adding')
                : t('materials.shares.add.action')}
            </Button>
          </div>
        ) : (
          <p className='text-muted-foreground'>
            {t('materials.shares.noCandidates')}
          </p>
        )}
        {actionFailed ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {t('materials.error.requestFailed')}
            </AlertDescription>
          </Alert>
        ) : null}
        <Separator />
        <div>
          <p className='mb-3 font-medium'>{t('materials.shares.current')}</p>
          {shares.length === 0 ? (
            <p className='text-muted-foreground'>
              {t('materials.shares.empty')}
            </p>
          ) : (
            <ul className='divide-y rounded-lg border'>
              {shares.map((share) => (
                <li
                  key={share.userId}
                  className='flex items-center justify-between gap-3 px-3 py-2'
                >
                  <span className='min-w-0 truncate'>
                    {share.name ?? share.userId}
                  </span>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('materials.shares.remove.label', {
                      name: share.name ?? share.userId,
                    })}
                    disabled={removingUserId === share.userId}
                    onClick={() => void handleRemove(share.userId)}
                  >
                    {removingUserId === share.userId ? (
                      <Spinner />
                    ) : (
                      <Trash2Icon />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <RouteDialog
      title={t('materials.shares.title')}
      description={t('materials.shares.description')}
      className='sm:max-w-2xl'
      footer={<SharesFooter />}
    >
      {body}
    </RouteDialog>
  );
}

function SharesFooter(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <Button type='button' variant='outline' onClick={() => void close()}>
      {t('actions.close')}
    </Button>
  );
}
