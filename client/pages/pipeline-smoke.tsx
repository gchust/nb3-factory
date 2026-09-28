import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * A deliberately tiny page whose only job is proving the build pipeline end to end: the route renders, its menu
 * entry works, and its button changes state. The count is component state, so a page reload resets it to zero.
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
      <Card>
        <CardContent className='flex items-center justify-between gap-4'>
          <span
            aria-label={t('pipelineSmoke.count')}
            aria-live='polite'
            className='font-heading text-4xl font-semibold tabular-nums'
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
