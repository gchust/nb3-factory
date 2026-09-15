import type { AppAuthorization } from '@nocobase/app-plugin-authorization';

import {
  SUPPORT_ATTACHMENT_COLLECTION,
  SUPPORT_REPORT_RESOURCE,
  SUPPORT_STAFF_RESOURCE,
  SUPPORT_TICKET_COLLECTION,
} from './constants.js';

/** Column names the authorization registry exposes for each collection. */
export const SUPPORT_TICKET_FIELDS = [
  'id',
  'number',
  'customerId',
  'title',
  'description',
  'priority',
  'status',
  'assigneeId',
  'createdAt',
  'updatedAt',
] as const;

export const SUPPORT_ATTACHMENT_FIELDS = [
  'id',
  'disk',
  'key',
  'filename',
  'ext',
  'mimeType',
  'size',
  'createdAt',
  'updatedAt',
  'ticketId',
  'customerId',
  'uploadedById',
  'uploaderRole',
] as const;

/**
 * Teach the authorization service about this module's resources. Without this
 * registration the database authorizer rejects every request for the
 * collections, and the settings UI cannot list them.
 */
export function registerSupportAuthorization(
  authorization: AppAuthorization,
): void {
  const collections = authorization.database.collections;
  if (!collections.get(SUPPORT_TICKET_COLLECTION)) {
    collections.add({
      name: SUPPORT_TICKET_COLLECTION,
      title: 'Support tickets',
      actions: ['read', 'create', 'update', 'delete'],
      fields: [...SUPPORT_TICKET_FIELDS],
      attributes: {
        identifier: 'id',
        owner: 'customerId',
        creator: 'customerId',
      },
    });
  }
  if (!collections.get(SUPPORT_ATTACHMENT_COLLECTION)) {
    collections.add({
      name: SUPPORT_ATTACHMENT_COLLECTION,
      title: 'Support attachments',
      actions: ['read', 'create', 'delete'],
      fields: [...SUPPORT_ATTACHMENT_FIELDS],
      // `customerId` mirrors the owning ticket so a customer's Record Access
      // policy covers every attachment on their tickets, whoever uploaded it.
      attributes: {
        identifier: 'id',
        owner: 'customerId',
        creator: 'uploadedById',
      },
    });
  }

  const resources = authorization.resources;
  const registered = new Set(resources.list());
  for (const resourceType of [
    SUPPORT_STAFF_RESOURCE,
    SUPPORT_REPORT_RESOURCE,
  ]) {
    if (registered.has(resourceType)) continue;
    resources.add({
      resourceType,
      async authorize(request, context) {
        const grants = await context.grants.resolve({
          principal: request.principal,
          subjects: request.subjects,
          resource: request.resource,
          action: request.action,
        });
        return grants.length > 0
          ? {
              effect: 'permit',
              reasons: grants.map((grant) => ({
                code: 'SUPPORT_RESOURCE_GRANTED',
                message: `${grant.source.plugin}:${grant.source.id} allows ${resourceType}.${request.action}`,
                plugin: 'support-tickets',
              })),
            }
          : {
              effect: 'deny',
              reasons: [
                {
                  code: 'SUPPORT_RESOURCE_DENIED',
                  message: `${resourceType}.${request.action} is not allowed`,
                  plugin: 'support-tickets',
                },
              ],
            };
      },
    });
  }
}
