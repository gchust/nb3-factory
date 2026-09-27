import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * A minimal signed-in page used to verify the automated build pipeline end to end.
 *
 * The counter lives only in component state, so it deliberately resets on reload; it exists to prove the page and its
 * button actually run, not to persist anything.
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
          className='text-4xl font-semibold tabular-nums'
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
