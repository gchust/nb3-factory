import { ClientApplication } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

export class DefaultClientServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-template-default/client';

  public override boot(): Promise<void> {
    this.app.refine.setOptions({ title: { text: 'NocoBase' } });
    // Resources register before any language is known, so the label is a
    // translation key plus the application's namespace; the sidebar translates
    // it as it renders. Without `i18nNs` the raw key would show in the nav.
    this.app.refine.addResources([
      {
        name: 'assets',
        list: '/it-assets',
        meta: {
          label: 'assets.nav',
          i18nNs: '@nocobase/app-template-default',
        },
      },
      {
        name: 'assetRecords',
        list: '/it-assets/records',
        meta: {
          label: 'assets.recordsNav',
          i18nNs: '@nocobase/app-template-default',
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
