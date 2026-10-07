import { useTranslation } from '@nocobase/i18n/client';
import { BotIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container.js';
import { PageHeader } from '@/components/page-header.js';
import { RequestError } from '@/components/service/states.js';
import type { AssistantStatusView } from '@/components/service/types.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useApiQuery } from '@/hooks/use-service-api.js';

/**
 * The assistant readiness page.
 *
 * The work-order assistant answers from the device manuals, so it is only
 * reachable when a model and a vector-backed knowledge base are configured. The
 * page states which of the two is missing rather than pretending a chat is
 * available, and links to the settings that would enable it.
 */
export default function AssistantPage(): ReactElement {
  const { t } = useTranslation();
  const status = useApiQuery<{ data: AssistantStatusView }>('/assistant');
  const info = status.data?.data;

  return (
    <PageContainer>
      <PageHeader
        title={t('service.assistant.title')}
        description={t('service.assistant.description')}
      />

      {status.error ? (
        <RequestError error={status.error} onRetry={status.reload} />
      ) : null}

      {info ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <BotIcon className='size-4' />
                {info.available
                  ? t('service.assistant.ready')
                  : t('service.assistant.unavailable')}
              </CardTitle>
              <CardDescription>
                {info.available
                  ? t('service.assistant.readyHint')
                  : t(
                      info.reason === 'ASSISTANT_MODEL_UNAVAILABLE'
                        ? 'service.assistant.reasonModel'
                        : 'service.assistant.reasonSetup',
                    )}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              <Row
                label={t('service.assistant.model')}
                value={
                  info.model.configured
                    ? `${info.model.provider ?? '—'} · ${info.model.model ?? '—'}`
                    : t('service.assistant.notConfigured')
                }
              />
              <Row
                label={t('service.assistant.vector')}
                value={
                  info.knowledgeBase.configured
                    ? (info.knowledgeBase.vectorDatabase ??
                      t('service.assistant.notConfigured'))
                    : t('service.assistant.notConfigured')
                }
              />
              <Row
                label={t('service.assistant.manuals')}
                value={t('service.assistant.manualCounts', {
                  indexed: info.indexedManualCount,
                  total: info.manualCount,
                })}
              />
              <div className='flex items-center gap-2'>
                <Badge variant={info.available ? 'default' : 'secondary'}>
                  {info.available
                    ? t('service.assistant.badgeReady')
                    : t('service.assistant.badgeBlocked')}
                </Badge>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => {
                    window.location.href = '/settings/ai';
                  }}
                >
                  {t('service.assistant.configure')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {!info.available ? (
            <p className='rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground'>
              {t('service.assistant.blockedNote')}
            </p>
          ) : null}
        </>
      ) : null}
    </PageContainer>
  );
}

function Row({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='flex items-center justify-between gap-4'>
      <span className='text-muted-foreground'>{label}</span>
      <span>{value}</span>
    </div>
  );
}
