import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * Pipeline smoke page.
 *
 * A deliberately small screen whose only job is to prove the Issue → Agent → verification → PR chain works end to
 * end. The counter lives in component state, so a reload starts it at zero again; nothing is persisted and no
 * endpoint is called.
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
        <output
          data-testid='pipeline-smoke-count'
          className='text-2xl font-semibold tabular-nums'
        >
          {count}
        </output>
        <Button onClick={() => setCount((value) => value + 1)}>+1</Button>
      </div>
    </PageContainer>
  );
}
