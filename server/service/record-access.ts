import { defineRecordAccess } from '@nocobase/authorization/core';
import {
  condition,
  type DatabaseScope,
} from '@nocobase/app-plugin-authorization/server';

/**
 * Record access resolvers for the service domain. The keys match the
 * serializable references exported from `./resources.js`, which is what
 * permission sets store.
 */

/**
 * Records whose assignee is the requesting principal. Orders and inspections
 * both carry `assigneeId`, resolved to the application user when a job is
 * provisioned.
 */
export const assignedToMeAccess = defineRecordAccess(
  'service.assignedToMe',
  (access) =>
    access
      .title('Assigned to me')
      .collections('serviceOrders', 'inspections')
      .resolver(({ principal }): DatabaseScope => {
        const id = principal.id;
        if (id === undefined || id === null || id === '') {
          return false;
        }
        return condition('assigneeId', '$eq', id);
      }),
);

/**
 * A scope that deliberately selects no record. It lets a permission set grant
 * an action as permitted while reaching nothing, so a caller such as an
 * observer lists an empty set instead of being denied or erroring. Sharing
 * Rules may still expand it for the individual records shared with them.
 */
export const noRecordsAccess = defineRecordAccess(
  'service.noRecords',
  (access) =>
    access
      .title('No records by default')
      .collections('serviceOrders')
      .resolver((): DatabaseScope => false),
);

/**
 * One explicitly shared order, addressed by its numeric primary key. A
 * Sharing Rule uses this because the built-in `records` selection carries
 * string ids and the order table's key is an integer, which the database
 * filter compiler rejects. The id travels as rule params, so the rule stays
 * the only record of who the order was shared with.
 */
export const sharedOrderAccess = defineRecordAccess(
  'service.sharedOrder',
  (access) =>
    access
      .title('Explicitly shared order')
      .collections('serviceOrders')
      .params<{ orderId: number }>()
      .resolver(({ params }): DatabaseScope => {
        const orderId = params?.orderId;
        if (typeof orderId !== 'number' || !Number.isFinite(orderId)) {
          return false;
        }
        return condition('id', '$eq', orderId);
      }),
);

/**
 * Published knowledge articles only. Drafts stay with their authors and
 * supervisors, who hold `manage` instead.
 */
export const publishedOnlyAccess = defineRecordAccess(
  'service.publishedOnly',
  (access) =>
    access
      .title('Published only')
      .collections('knowledgeArticles')
      .resolver((): DatabaseScope => condition('status', '$eq', 'published')),
);

export const serviceRecordAccess = [
  assignedToMeAccess,
  noRecordsAccess,
  publishedOnlyAccess,
  sharedOrderAccess,
] as const;
export { serviceRecordAccess as default };
