import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';

import { SharesCard } from './shares-card.js';
import { UsersCard } from './users-card.js';

/**
 * `/settings` — the administrator's surface for the document library. The route is gated on the `documents.admin`
 * settings item, enforced by the server; a person without it does not reach the page at all.
 */
export default function SettingsPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <PageHeader
        title={t('settings.title')}
        description={t('settings.description')}
      />
      <Tabs defaultValue='users'>
        <TabsList>
          <TabsTrigger value='users'>{t('settings.tabs.users')}</TabsTrigger>
          <TabsTrigger value='shares'>{t('settings.tabs.shares')}</TabsTrigger>
        </TabsList>
        <TabsContent value='users'>
          <UsersCard />
        </TabsContent>
        <TabsContent value='shares'>
          <SharesCard />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
