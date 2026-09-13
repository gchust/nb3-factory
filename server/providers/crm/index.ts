import type { Application } from '@nocobase/app-server/application';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import { databaseManagerToken } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import { CrmService, CRM_RESOURCES } from './service.js';

export { CrmService, CRM_RESOURCES };
export type {
  AttachmentRecord,
  AttachmentView,
  ContactRecord,
  CustomerRecord,
  FileRecord,
  FollowUpRecord,
  OpportunityRecord,
} from './service.js';

export const crmServiceToken: ServiceToken<CrmService> =
  createServiceToken<CrmService>('app/crm-service');

const COMMON_ACTIONS = ['read', 'create', 'update', 'delete'] as const;

/**
 * The collections the CRM authorizes. Registering them makes them selectable by
 * Permission Sets and lets the database authorizer return the record filter a
 * caller is limited to.
 */
const COLLECTIONS = [
  {
    name: 'crmCustomers',
    title: 'CRM Customers',
    fields: [
      'id',
      'name',
      'industry',
      'companySize',
      'source',
      'status',
      'ownerId',
      'notes',
      'createdAt',
      'updatedAt',
    ],
    attributes: { identifier: 'id', owner: 'ownerId' },
  },
  {
    name: 'crmContacts',
    title: 'CRM Contacts',
    fields: [
      'id',
      'customerId',
      'name',
      'title',
      'phone',
      'email',
      'isPrimary',
      'ownerId',
      'createdAt',
      'updatedAt',
    ],
    attributes: { identifier: 'id', owner: 'ownerId' },
  },
  {
    name: 'crmOpportunities',
    title: 'CRM Opportunities',
    fields: [
      'id',
      'name',
      'customerId',
      'amount',
      'stage',
      'expectedCloseDate',
      'ownerId',
      'wonAmount',
      'lostReason',
      'createdAt',
      'updatedAt',
    ],
    attributes: { identifier: 'id', owner: 'ownerId' },
  },
  {
    name: 'crmFollowUps',
    title: 'CRM Follow-ups',
    fields: [
      'id',
      'customerId',
      'opportunityId',
      'method',
      'summary',
      'nextStep',
      'followedAt',
      'ownerId',
      'createdAt',
      'updatedAt',
    ],
    attributes: { identifier: 'id', owner: 'ownerId' },
  },
  {
    name: 'crmAttachments',
    title: 'CRM Attachments',
    fields: ['id', 'targetType', 'targetId', 'fileId', 'ownerId', 'createdAt'],
    attributes: { identifier: 'id', owner: 'ownerId' },
  },
] as const;

export default class CrmProvider extends ServiceProvider<Application> {
  public readonly name = 'app/crm';

  public override register(): void {
    this.app.container.singleton(
      crmServiceToken,
      (container) => new CrmService(container.resolve(databaseManagerToken)),
    );
  }

  public override boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return Promise.resolve();
    const authorization: AppAuthorization =
      this.app.container.resolve(authorizationToken);
    for (const definition of COLLECTIONS) {
      if (authorization.database.collections.get(definition.name)) continue;
      authorization.database.collections.add({
        name: definition.name,
        title: definition.title,
        actions: [...COMMON_ACTIONS],
        fields: [...definition.fields],
        attributes: { ...definition.attributes },
      });
    }
    return Promise.resolve();
  }
}
