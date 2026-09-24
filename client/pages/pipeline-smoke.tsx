import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * A deliberately small page that proves the automated pipeline actually changed
 * the running application: a title, one line of description, a counter that
 * starts at zero and a button that adds one to it.
 *
 * The count lives in component state only. It resets on reload by design — this
 * page verifies the build chain, not persistence, so it reads and writes no
 * record and calls no endpoint.
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
        <p className='font-heading text-4xl font-semibold tabular-nums'>
          {count}
        </p>
        <Button onClick={() => setCount((current) => current + 1)}>
          {t('pipelineSmoke.increment')}
        </Button>
      </div>
    </PageContainer>
  );
}
