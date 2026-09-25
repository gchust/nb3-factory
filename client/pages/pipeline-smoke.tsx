import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * A pipeline smoke page: title, one line of explanation, a count and a "+1" button.
 *
 * The count is deliberately page-local state. This page verifies that the automated build pipeline can ship a real
 * application change, so a refresh dropping it back to zero is the intended behavior, not a missing persistence bug.
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
          aria-live='polite'
          className='font-heading text-4xl font-semibold tabular-nums'
        >
          {count}
        </output>
        <Button
          type='button'
          onClick={() => setCount((current) => current + 1)}
        >
          <PlusIcon data-icon='inline-start' />
          {t('pipelineSmoke.increment')}
        </Button>
      </div>
    </PageContainer>
  );
}
