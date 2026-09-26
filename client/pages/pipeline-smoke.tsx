import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * A minimal smoke-test page for verifying the automated build pipeline end to end.
 *
 * The count is component state on purpose: it resets to 0 on every reload and is never persisted, so the page
 * exercises routing, navigation and a stateful button without adding a collection, endpoint or permission.
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
      <div className='flex items-center gap-3'>
        {/* `output` has the status role, so the labelled count is announced when it changes. */}
        <output
          aria-label={t('pipelineSmoke.countLabel')}
          className='font-heading text-2xl font-semibold tabular-nums'
        >
          {count}
        </output>
        <Button onClick={() => setCount((value) => value + 1)}>+1</Button>
      </div>
    </PageContainer>
  );
}
