import { ClientApplication } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { APP_NS } from '@nocobase/i18n';
import { ServiceProvider } from '@nocobase/service-provider';
import {
  BarChart3,
  Building2,
  CalendarClock,
  FolderKanban,
  Handshake,
  Users,
  UsersRound,
} from 'lucide-react';

export class DefaultClientServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-template-default/client';

  public override boot(): Promise<void> {
    this.app.refine.setOptions({ title: { text: 'NocoBase' } });
    this.app.refine.addResources([
      {
        name: 'dashboard',
        list: '/dashboard',
        meta: {
          label: 'navigation.dashboard',
          i18nNs: APP_NS,
          icon: <BarChart3 />,
        },
      },
      {
        name: 'leads',
        list: '/leads',
        meta: {
          label: 'navigation.leads',
          i18nNs: APP_NS,
          icon: <Handshake />,
        },
      },
      {
        name: 'customers',
        list: '/customers',
        meta: {
          label: 'navigation.customers',
          i18nNs: APP_NS,
          icon: <Building2 />,
        },
      },
      {
        name: 'contacts',
        list: '/contacts',
        meta: {
          label: 'navigation.contacts',
          i18nNs: APP_NS,
          icon: <Users />,
        },
      },
      {
        name: 'opportunities',
        list: '/opportunities',
        meta: {
          label: 'navigation.opportunities',
          i18nNs: APP_NS,
          icon: <FolderKanban />,
        },
      },
      {
        name: 'follow-ups',
        list: '/follow-ups',
        meta: {
          label: 'navigation.followUps',
          i18nNs: APP_NS,
          icon: <CalendarClock />,
        },
      },
      {
        name: 'directory',
        list: '/directory',
        meta: {
          label: 'navigation.directory',
          i18nNs: APP_NS,
          icon: <UsersRound />,
        },
      },
    ]);
    return Promise.resolve();
  }
}

const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  DefaultClientServiceProvider,
];

export default serviceProviders;
