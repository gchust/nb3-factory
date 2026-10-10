import { useApiClient, useToaster, type ApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useState, type ReactElement } from 'react';

import {
  createIntegrationKey,
  listIntegrationKeys,
  revokeIntegrationKey,
} from '@/api/service';
import type {
  CreatedIntegrationKey,
  IntegrationKey,
} from '@/api/service-types';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { ServiceTable } from '@/components/service/service-table';
import { useServiceResource } from '@/hooks/use-service-resource';

/**
 * API keys for the external platform's machine account.
 *
 * The keys belong to the user assigned the `service.integrator` permission set,
 * and the server gates this whole surface on `service.integration.manage`, so a
 * supervisor issues the credential a third-party system authenticates with. The
 * secret exists only in the answer to the create request: it is shown once here
 * and cannot be read back, so a lost secret is replaced, never recovered.
 */
export default function IntegrationKeysPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedIntegrationKey | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(
    (client: ApiClient, signal: AbortSignal) =>
      listIntegrationKeys(client, signal),
    [],
  );
  const keys = useServiceResource('integration-keys', load);
  const canManage = useCan({
    resource: { type: 'page', id: 'service.integrationKeys' },
    action: 'access',
  });

  async function submit(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed || creating) {
      return;
    }
    const parsed = expiresInDays.trim() === '' ? null : Number(expiresInDays);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed <= 0)) {
      toaster.show({
        type: 'error',
        title: t('service.integrationKeys.expiryInvalid'),
      });
      return;
    }
    setCreating(true);
    try {
      const result = await createIntegrationKey(api, {
        name: trimmed,
        expiresInDays: parsed,
      });
      setCreated(result);
      setName('');
      setExpiresInDays('');
      keys.reload();
    } catch {
      toaster.show({
        type: 'error',
        title: t('service.integrationKeys.createFailed'),
      });
    } finally {
      setCreating(false);
    }
  }

  async function revoke(key: IntegrationKey): Promise<void> {
    setRevokingId(key.id);
    try {
      await revokeIntegrationKey(api, key.id);
      toaster.show({
        type: 'success',
        title: t('service.integrationKeys.revoked'),
      });
      if (created?.key.id === key.id) {
        setCreated(null);
      }
      keys.reload();
    } catch {
      toaster.show({
        type: 'error',
        title: t('service.integrationKeys.revokeFailed'),
      });
    } finally {
      setRevokingId(null);
    }
  }

  async function copySecret(): Promise<void> {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.secret);
      toaster.show({
        type: 'success',
        title: t('service.integrationKeys.copied'),
      });
    } catch {
      toaster.show({
        type: 'error',
        title: t('service.integrationKeys.copyFailed'),
      });
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('service.integrationKeys.title')}
        description={t('service.integrationKeys.description')}
        actions={
          <Button onClick={keys.reload} size='sm' variant='outline'>
            <RefreshCw aria-hidden='true' />
            {t('service.actions.refresh')}
          </Button>
        }
      />

      {canManage.can ? (
        <div className='flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4'>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='integration-key-name'>
              {t('service.integrationKeys.name')}
            </Label>
            <Input
              id='integration-key-name'
              onChange={(event) => setName(event.target.value)}
              placeholder={t('service.integrationKeys.namePlaceholder')}
              value={name}
            />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='integration-key-expiry'>
              {t('service.integrationKeys.expiresInDays')}
            </Label>
            <Input
              id='integration-key-expiry'
              inputMode='numeric'
              onChange={(event) => setExpiresInDays(event.target.value)}
              placeholder={t('service.integrationKeys.expiresPlaceholder')}
              value={expiresInDays}
            />
          </div>
          <Button
            disabled={creating || name.trim() === ''}
            onClick={() => {
              void submit();
            }}
            size='sm'
          >
            <Plus aria-hidden='true' />
            {t('service.integrationKeys.createAction')}
          </Button>
        </div>
      ) : null}

      {created ? (
        <Alert>
          <KeyRound aria-hidden='true' />
          <AlertTitle>{t('service.integrationKeys.secretTitle')}</AlertTitle>
          <AlertDescription>
            {t('service.integrationKeys.secretHint')}
          </AlertDescription>
          <div className='mt-2 flex flex-wrap items-center gap-2'>
            <Input
              className='font-mono'
              onFocus={(event) => event.target.select()}
              readOnly
              value={created.secret}
            />
            <Button
              onClick={() => void copySecret()}
              size='sm'
              variant='outline'
            >
              {t('service.integrationKeys.copyAction')}
            </Button>
          </div>
        </Alert>
      ) : null}

      {keys.error ? (
        <ServiceErrorNotice error={keys.error} onRetry={keys.reload} />
      ) : null}

      <ServiceTable
        caption={t('service.integrationKeys.title')}
        columns={[
          {
            key: 'name',
            header: t('service.integrationKeys.name'),
            cell: (row: IntegrationKey) => row.name ?? '—',
          },
          {
            key: 'enabled',
            header: t('service.integrationKeys.state'),
            cell: (row) =>
              row.enabled
                ? t('service.integrationKeys.enabled')
                : t('service.integrationKeys.disabled'),
          },
          {
            key: 'createdAt',
            header: t('service.integrationKeys.createdAt'),
            cell: (row) => row.createdAt,
          },
          {
            key: 'lastRequest',
            header: t('service.integrationKeys.lastRequest'),
            cell: (row) => row.lastRequest ?? '—',
          },
          {
            key: 'expiresAt',
            header: t('service.integrationKeys.expiresAt'),
            cell: (row) => row.expiresAt ?? t('service.integrationKeys.never'),
          },
          ...(canManage.can
            ? [
                {
                  key: 'actions',
                  header: '',
                  align: 'end' as const,
                  cell: (row: IntegrationKey) => (
                    <Button
                      disabled={revokingId === row.id}
                      onClick={() => {
                        void revoke(row);
                      }}
                      size='xs'
                      variant='ghost'
                    >
                      <Trash2 aria-hidden='true' />
                      {t('service.integrationKeys.revokeAction')}
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
        empty={t('service.integrationKeys.empty')}
        isPending={keys.isPending}
        rowKey={(row) => row.id}
        rows={keys.data ?? []}
      />
    </PageContainer>
  );
}
