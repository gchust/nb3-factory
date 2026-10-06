import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * Pipeline smoke page.
 *
 * This screen exists only to prove that a request reaches real, working application code: a route, a menu entry and
 * a button whose handler changes what the page shows. The count is deliberately page-local `useState` — it is never
 * persisted or sent to the server, so a reload starts again from zero.
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
        <span
          className='font-heading text-4xl font-semibold tabular-nums'
          data-testid='pipeline-smoke-count'
        >
          {count}
        </span>
        <Button onClick={() => setCount((value) => value + 1)}>
          {t('pipelineSmoke.increment')}
        </Button>
      </div>
    </PageContainer>
  );
}
