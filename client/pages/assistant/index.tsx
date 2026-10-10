import type { ApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Bot, RefreshCw } from 'lucide-react';
import { useCallback, type ReactElement } from 'react';
import { Link } from 'react-router';

import { getAssistantStatus } from '@/api/service';
import type { AssistantStatus } from '@/api/service-types';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useServiceResource } from '@/hooks/use-service-resource';

/**
 * The AI service assistant, as it really is in this deployment.
 *
 * The employee and its order-lookup tool are registered on the server; the chat
 * surface is not part of this application's client, and answering also needs a
 * configured model service. Both facts are read from the server and shown, so
 * the page reports what is missing instead of drawing a conversation box that
 * could not answer.
 */
export default function ServiceAssistantPage(): ReactElement {
  const { t } = useTranslation();
  const load = useCallback(
    (client: ApiClient, signal: AbortSignal) =>
      getAssistantStatus(client, signal),
    [],
  );
  const assistant = useServiceResource<AssistantStatus>(
    'service-assistant',
    load,
  );
  const status = assistant.data;
  const yesNo = (value: boolean): string =>
    value ? t('service.common.yes') : t('service.common.no');

  return (
    <PageContainer>
      <PageHeader
        title={t('service.assistant.title')}
        description={t('service.assistant.description')}
        actions={
          <Button onClick={assistant.reload} size='sm' variant='outline'>
            <RefreshCw aria-hidden='true' />
            {t('service.actions.refresh')}
          </Button>
        }
      />

      {assistant.error ? (
        <ServiceErrorNotice
          error={assistant.error}
          onRetry={assistant.reload}
        />
      ) : null}

      {status === undefined ? (
        <div className='grid gap-4 md:grid-cols-2'>
          <Skeleton className='h-40 w-full' />
          <Skeleton className='h-40 w-full' />
        </div>
      ) : (
        <div className='grid gap-4 md:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Bot aria-hidden='true' className='size-4' />
                {t('service.assistant.statusTitle')}
              </CardTitle>
              <CardDescription>{t('service.assistant.title')}</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              <p>
                <span className='text-muted-foreground'>
                  {t('service.assistant.employeeName')}:{' '}
                </span>
                <span className='font-mono'>{status.employee.username}</span>
                <span className='px-1 text-muted-foreground'>·</span>
                {status.employee.nickname}
              </p>
              <p>
                <span className='text-muted-foreground'>
                  {t('service.assistant.registered')}:{' '}
                </span>
                {status.employee.registered
                  ? t('service.assistant.registered')
                  : t('service.assistant.notRegistered')}
              </p>
              <p>
                <span className='text-muted-foreground'>
                  {t('service.assistant.responder')}:{' '}
                </span>
                {yesNo(status.responderReady)}
              </p>
              <div>
                <p className='text-muted-foreground'>
                  {t('service.assistant.tools')}
                </p>
                {status.tools.length === 0 ? (
                  <p className='text-muted-foreground'>
                    {t('service.common.notAvailable')}
                  </p>
                ) : (
                  <ul className='space-y-1 pt-1'>
                    {status.tools.map((tool) => (
                      <li
                        className='flex items-center justify-between gap-2'
                        key={tool.name}
                      >
                        <span className='font-mono text-xs'>{tool.name}</span>
                        <span className='text-muted-foreground'>
                          {tool.registered
                            ? t('service.assistant.registered')
                            : t('service.assistant.notRegistered')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('service.assistant.modelTitle')}</CardTitle>
              <CardDescription>
                {t('service.assistant.modelHint')}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-2 text-sm'>
              <p className='text-muted-foreground'>
                {t('service.assistant.llmServices')}
              </p>
              {status.llmServices.length === 0 ? (
                <p className='text-muted-foreground'>
                  {t('service.common.notAvailable')}
                </p>
              ) : (
                <ul className='space-y-1'>
                  {status.llmServices.map((service) => (
                    <li className='font-mono text-xs' key={service}>
                      {service}
                    </li>
                  ))}
                </ul>
              )}
              <p className='pt-2'>
                <Link
                  className='font-medium underline underline-offset-4'
                  to='/manuals'
                >
                  {t('service.navigation.manuals')}
                </Link>
              </p>
            </CardContent>
          </Card>

          <Alert className='md:col-span-2'>
            <Bot aria-hidden='true' />
            <AlertTitle>{t('service.assistant.chatTitle')}</AlertTitle>
            <AlertDescription>
              {t('service.assistant.chatBlocked')}
            </AlertDescription>
          </Alert>
        </div>
      )}
    </PageContainer>
  );
}
