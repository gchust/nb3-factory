import { ClientApplication } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { APP_NS } from '@nocobase/i18n';
import { ServiceProvider } from '@nocobase/service-provider';

export class DefaultClientServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-template-default/client';

  public override boot(): Promise<void> {
    this.app.refine.setOptions({ title: { text: 'NocoBase' } });
    this.app.refine.addResources([
      {
        name: 'meeting-rooms',
        list: '/meeting-rooms',
        meta: { label: 'navigation.meetingRooms', i18nNs: APP_NS },
      },
      {
        name: 'meeting-bookings',
        list: '/meeting-bookings',
        meta: { label: 'navigation.meetingBookings', i18nNs: APP_NS },
      },
    ]);
    return Promise.resolve();
  }
}

const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  DefaultClientServiceProvider,
];

export default serviceProviders;
