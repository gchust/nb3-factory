import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { crm } from '../crm/resources.js';
import { createCrmService } from '../crm/service.js';
import { crmServiceToken } from '../crm/tokens.js';

/** The CRM tables as the authorization workspace lists them. */
const CRM_COLLECTION_TITLES: Readonly<Record<string, string>> = {
  crmCustomers: 'CRM customers',
  crmContacts: 'CRM contacts',
  crmOpportunities: 'CRM opportunities',
  crmFollowUps: 'CRM follow-up records',
  crmSuggestions: 'CRM assistant suggestions',
};

/**
 * Registers the CRM business resources and the domain service.
 *
 * The composite resource is the grantable unit the seeded permission sets
 * reference, so it must be defined before the authorization provider validates
 * the stored grants at startup. Registration only makes the operations
 * grantable; the seeded sets decide who holds them.
 */
export class CrmProvider extends ServiceProvider<Application> {
  name = '@nocobase/app/crm';

  register(): void {
    this.app.container.singleton(crmServiceToken, (container) =>
      createCrmService(container.resolve(databaseManagerToken)),
    );
  }

  async boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);

    for (const [name, title] of Object.entries(CRM_COLLECTION_TITLES)) {
      authz.database.collections.add({ name, title });
    }

    const reference = authz.compositeResources.define(crm);
    authz.ui.sections.add({ name: 'crm', title: 'CRM', parent: 'business' });
    authz.ui.place(reference, { section: 'crm' });
  }
}
