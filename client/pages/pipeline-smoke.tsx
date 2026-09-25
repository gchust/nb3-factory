import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * A deliberately small page that proves the automated build pipeline end to end: a route, a menu entry,
 * translations and a wired interaction. The count stays in component state on purpose — it is not business data,
 * so nothing is persisted and a browser refresh returning it to 0 is expected.
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
          {t('pipelineSmoke.count')}
        </span>
        <span className='font-heading text-4xl font-semibold tabular-nums'>
          {count}
        </span>
        <Button onClick={() => setCount((value) => value + 1)}>
          <PlusIcon data-icon='inline-start' />
          {t('pipelineSmoke.increment')}
        </Button>
      </div>
    </PageContainer>
  );
}
