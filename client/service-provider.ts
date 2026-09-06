import { APP_NS } from '@nocobase/i18n';
import { ClientApplication } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

export class DefaultClientServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-template-default/client';

  public override boot(): Promise<void> {
    this.app.refine.setOptions({ title: { text: 'NocoBase' } });
    this.app.refine.addResources([
      {
        name: 'it-service-desk',
        list: '/it-service-desk',
        meta: {
          label: 'navigation.itServiceDesk',
          i18nNs: APP_NS,
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
