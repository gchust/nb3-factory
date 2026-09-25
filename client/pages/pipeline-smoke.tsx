import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Minimal end-to-end smoke screen used to confirm the automated build pipeline
 * works. The count is deliberately page-local state only: it is never persisted,
 * so a refresh resets it to zero and the page needs no table, API or permission.
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
      <Card>
        <CardContent className='flex flex-wrap items-center gap-4'>
          <span className='font-heading text-4xl tabular-nums'>{count}</span>
          <Button onClick={() => setCount((current) => current + 1)}>
            {t('pipelineSmoke.increment')}
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
