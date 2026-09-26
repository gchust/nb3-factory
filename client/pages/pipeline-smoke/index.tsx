import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * A counter that exercises the application's build pipeline end to end.
 *
 * The count is deliberately page-local React state: this page exists only to prove that a change made
 * through the pipeline reaches a running application, so it is never persisted and resets on refresh.
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
      <Card className='max-w-xs'>
        <CardContent className='flex items-center justify-between gap-4'>
          <span
            aria-live='polite'
            aria-label={t('pipelineSmoke.count')}
            className='text-2xl font-semibold tabular-nums'
          >
            {count}
          </span>
          <Button onClick={() => setCount((value) => value + 1)}>
            {t('pipelineSmoke.increment')}
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
