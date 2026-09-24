import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Pipeline smoke page: a login-only probe used to verify the automated build pipeline end to end.
 *
 * The counter is intentionally held in component state. It has no endpoint, table or persisted value, so a page
 * reload resets it to zero by design. Replacing this with server state would turn a pipeline probe into a business
 * feature, which is out of scope for this page.
 */
export default function PipelineSmokePage(): ReactElement {
  const { t } = useTranslation();
  const [count, setCount] = useState(0);

  return (
    <PageContainer>
      <PageHeader
        title={t('pipelineSmoke.title')}
        description={t('pipelineSmoke.description')}
      />
      <Card className='max-w-sm'>
        <CardContent className='flex items-center justify-between gap-6'>
          <div className='space-y-1'>
            <p className='text-sm text-muted-foreground'>
              {t('pipelineSmoke.countLabel')}
            </p>
            <p
              className='font-heading text-4xl font-semibold tabular-nums'
              data-testid='pipeline-smoke-count'
            >
              {count}
            </p>
          </div>
          <Button onClick={() => setCount((current) => current + 1)}>
            {t('pipelineSmoke.increment')}
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
