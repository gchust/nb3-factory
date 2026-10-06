import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * The smallest end-to-end check that a page, its navigation entry, its translations and its button handler all work.
 *
 * The count is deliberately component state only: it starts at 0 on every mount and is never persisted, so a refresh
 * resets it. That is the point of the page, not an unfinished feature.
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
        <CardContent className='flex flex-col items-start gap-4'>
          <p
            aria-live='polite'
            className='font-heading text-4xl font-semibold tabular-nums'
          >
            {count}
          </p>
          <Button onClick={() => setCount((value) => value + 1)}>
            <PlusIcon data-icon='inline-start' />
            {t('pipelineSmoke.increment')}
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
