import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * A deliberately tiny page whose only job is to prove the automated pipeline can carry an issue all the way to a
 * shipped change. It has no data model, endpoint or permission of its own.
 *
 * The counter lives in component state only. It starts at zero on every load and nothing persists it, so a page
 * refresh resets it — that is the required behavior, not an oversight.
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
      <div className='flex items-center gap-4'>
        <span className='text-sm text-muted-foreground'>
          {t('pipelineSmoke.countLabel')}
        </span>
        <span
          className='font-heading text-3xl font-semibold tabular-nums'
          data-testid='pipeline-smoke-count'
        >
          {count}
        </span>
        <Button onClick={() => setCount((current) => current + 1)}>
          {t('pipelineSmoke.increment')}
        </Button>
      </div>
    </PageContainer>
  );
}
