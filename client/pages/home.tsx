import { useTranslation } from '@nocobase/i18n/client';
import { ChevronDownIcon } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

/**
 * The team announcement landing page. It is a fixed notice, so it reads no data: the title and summary are always
 * shown, while the notes body stays collapsed until the reader opens it.
 */
export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <PageContainer>
      <PageHeader title={t('home.title')} description={t('home.description')} />
      <Collapsible
        open={notesOpen}
        onOpenChange={setNotesOpen}
        className='w-full max-w-2xl overflow-hidden rounded-xl border bg-card text-card-foreground'
      >
        <CollapsibleTrigger
          render={
            <Button
              variant='ghost'
              className='h-auto w-full justify-between rounded-none px-4 py-3'
            />
          }
        >
          {t('home.notes.title')}
          <ChevronDownIcon
            aria-hidden='true'
            className='text-muted-foreground transition-transform group-data-panel-open/button:rotate-180'
          />
        </CollapsibleTrigger>
        <CollapsibleContent className='border-t px-4 py-3 text-sm leading-6 text-muted-foreground'>
          {t('home.notes.body')}
        </CollapsibleContent>
      </Collapsible>
    </PageContainer>
  );
}
