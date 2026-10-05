/**
 * The after-sales service landing page.
 *
 * This route is deliberately outside page authorization (`authz: 'skip'` on the
 * route) so no permission change can leave a signed-in user with nowhere to
 * land. It therefore does not assume any particular page grant: it names the
 * application and offers the business areas as links, and the sidebar answers
 * which of them the current user may actually open. The server still enforces
 * every page's own access when the link is followed.
 */
import { useTranslation } from '@nocobase/i18n/client';
import { Link } from 'react-router';
import type { ReactElement } from 'react';
import {
  BookOpenIcon,
  BotIcon,
  CalendarCheckIcon,
  ClipboardListIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  MonitorCogIcon,
  PlugIcon,
  UsersIcon,
} from 'lucide-react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface Entry {
  readonly key: string;
  readonly to: string;
  readonly icon: typeof LayoutDashboardIcon;
}

const entries: readonly Entry[] = [
  { key: 'dashboard', to: '/service', icon: LayoutDashboardIcon },
  {
    key: 'workOrders',
    to: '/service/work-orders',
    icon: ClipboardListIcon,
  },
  { key: 'equipment', to: '/service/equipment', icon: MonitorCogIcon },
  { key: 'customers', to: '/service/customers', icon: UsersIcon },
  {
    key: 'inspections',
    to: '/service/inspections',
    icon: CalendarCheckIcon,
  },
  { key: 'knowledge', to: '/service/knowledge', icon: BookOpenIcon },
  { key: 'manuals', to: '/service/manuals', icon: FileTextIcon },
  { key: 'assistant', to: '/service/assistant', icon: BotIcon },
  { key: 'integration', to: '/service/integration', icon: PlugIcon },
];

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <PageHeader title={t('home.title')} description={t('home.description')} />
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {entries.map((entry) => {
          const Icon = entry.icon;
          return (
            <Card key={entry.key}>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <Icon className='size-4 text-muted-foreground' />
                  {t(`service.nav.${entry.key}`)}
                </CardTitle>
                <CardDescription>
                  {t(`service.nav.hints.${entry.key}`)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant='outline'
                  size='sm'
                  render={<Link to={entry.to} />}
                >
                  {t('home.open')}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageContainer>
  );
}
