import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

import { LeaveService } from './leave.js';

const NAMESPACE = 'nb3-factory';

export const leaveServiceToken = createServiceToken<LeaveService>(
  'nb3-factory/leave-service',
);

/**
 * Registers the leave service and the `leave.approvals` settings resource.
 *
 * Deciding a request is granted through a Permission Set rather than through a
 * page: every signed-in person reaches the leave page, while only a holder of
 * the `decide` action may review somebody else's request.
 */
export class LeaveProvider extends ServiceProvider<Application> {
  public readonly name: string = 'nb3-factory/leave';

  public override register(): void {
    this.app.container.singleton(
      leaveServiceToken,
      () => new LeaveService(this.app.container.resolve(databaseManagerToken)),
    );
  }

  public override async boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);
    authz.ui.sections.add({
      name: 'leave',
      title: { key: 'navigation.leave', ns: NAMESPACE },
      parent: 'business',
    });
    authz.settings.add({
      id: 'leave.approvals',
      title: { key: 'leave.permissions.approvals', ns: NAMESPACE },
      actions: [
        {
          name: 'decide',
          title: { key: 'leave.permissions.decide', ns: NAMESPACE },
        },
      ],
    });
    authz.ui.place(
      { type: 'settings', id: 'leave.approvals' },
      { section: 'leave' },
    );
  }
}
