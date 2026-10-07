import { useTranslation } from '@nocobase/i18n/client';
import {
  BookOpen,
  CalendarCheck,
  ClipboardList,
  FileText,
  HardDrive,
  LayoutDashboard,
  Users,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container.js';
import { PageHeader } from '@/components/page-header.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * The landing page of the after-sales service application.
 *
 * A signed-in user lands here before choosing a section, so instead of a
 * template placeholder it offers the business entry points that person may
 * actually reach. Navigation filters the same pages by their own `authz`, so a
 * link is only a shortcut; clicking one still passes the guard.
 */
const shortcuts = [
  {
    to: '/dashboard',
    icon: LayoutDashboard,
    title: 'navigation.dashboard',
    hint: 'service.dashboard.description',
  },
  {
    to: '/customers',
    icon: Users,
    title: 'navigation.customers',
    hint: 'service.customer.description',
  },
  {
    to: '/devices',
    icon: HardDrive,
    title: 'navigation.devices',
    hint: 'service.device.description',
  },
  {
    to: '/workOrders',
    icon: ClipboardList,
    title: 'navigation.workOrders',
    hint: 'service.workOrder.description',
  },
  {
    to: '/inspections',
    icon: CalendarCheck,
    title: 'navigation.inspections',
    hint: 'service.inspection.description',
  },
  {
    to: '/knowledge',
    icon: BookOpen,
    title: 'navigation.knowledge',
    hint: 'service.note.description',
  },
  {
    to: '/manuals',
    icon: FileText,
    title: 'navigation.manuals',
    hint: 'service.manual.description',
  },
] as const;

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <PageHeader title={t('home.title')} description={t('home.description')} />

      <Card>
        <CardHeader>
          <CardTitle>{t('home.quickLinks')}</CardTitle>
          <CardDescription>{t('home.quickLinksHint')}</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className='flex items-start gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:border-primary/60'
              >
                <Icon className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
                <span className='space-y-1'>
                  <span className='block text-sm font-medium'>
                    {t(item.title)}
                  </span>
                  <span className='block text-xs text-muted-foreground'>
                    {t(item.hint)}
                  </span>
                </span>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
