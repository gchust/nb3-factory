import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * In-memory smoke test page. The counter intentionally lives only in component state, so it resets on reload and no
 * database, API or migration is involved.
 */
export default function PipelineSmokePage(): ReactElement {
  const { t } = useTranslation();
  const [count, setCount] = useState(0);

  return (
    <PageContainer className='mx-auto max-w-3xl'>
      <PageHeader
        title={t('pipelineSmoke.title')}
        description={t('pipelineSmoke.description')}
      />
      <div className='flex items-center gap-4'>
        <span
          className='font-heading text-3xl font-semibold tabular-nums'
          data-testid='pipeline-smoke-count'
        >
          {count}
        </span>
        <Button type='button' onClick={() => setCount((value) => value + 1)}>
          {t('pipelineSmoke.increment')}
        </Button>
      </div>
    </PageContainer>
  );
}
