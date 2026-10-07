import { useTranslation } from '@nocobase/i18n/client';
import { BookOpenIcon, MessageCircleQuestionIcon } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { Outlet } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { AskPanel } from './ask-panel.js';
import { DocumentBrowse } from './document-browse.js';

/**
 * The employee document center: browse the documents the signed-in user may
 * read, or ask a question and get the paragraphs that answer it. The preview is
 * a child route rendered in the outlet below the page.
 */
export default function DocumentsPage(): ReactElement {
  const { t } = useTranslation();
  const [tab, setTab] = useState('browse');

  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('documents.title')}
          description={t('documents.description')}
        />
        <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
          <TabsList>
            <TabsTrigger value='browse'>
              <BookOpenIcon />
              {t('documents.tab.browse')}
            </TabsTrigger>
            <TabsTrigger value='ask'>
              <MessageCircleQuestionIcon />
              {t('documents.tab.ask')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value='browse'>
            <DocumentBrowse />
          </TabsContent>
          <TabsContent value='ask'>
            <AskPanel />
          </TabsContent>
        </Tabs>
      </PageContainer>
      <Outlet />
    </>
  );
}
