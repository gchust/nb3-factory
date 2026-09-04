import { ClientApplication } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { ServiceProvider } from '@nocobase/service-provider';
import { Archive, History } from 'lucide-react';

/** The application's own locale namespace, where `client/locales/*` strings live. */
const APP_NS = '@nocobase/app-template-default';

export class DefaultClientServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-template-default/client';

  public override boot(): Promise<void> {
    this.app.refine.setOptions({ title: { text: 'NocoBase' } });
    this.app.refine.addResources([
      {
        name: 'equipment',
        list: '/equipment',
        meta: {
          label: 'equipment.navigation.equipment',
          i18nNs: APP_NS,
          icon: <Archive />,
        },
      },
      {
        name: 'equipment-borrow-records',
        list: '/equipment/borrow-records',
        meta: {
          label: 'equipment.navigation.borrowRecords',
          i18nNs: APP_NS,
          icon: <History />,
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
