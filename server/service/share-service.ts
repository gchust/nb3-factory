import type { DatabaseManager } from '@nocobase/db';
import {
  defineSharingRule,
  type SharingRule,
} from '@nocobase/authorization/sharing-rules';
import { selection } from '@nocobase/authorization/core';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';

import { ordersResource } from './resources.js';
import { asText } from './values.js';

interface SharingRulesApiLike {
  create(rule: SharingRule): Promise<SharingRule>;
  update(key: string, rule: SharingRule): Promise<SharingRule>;
  get(key: string): Promise<SharingRule | undefined>;
  delete(key: string): Promise<void>;
  list(): Promise<readonly SharingRule[]>;
}

type ServiceAuthorization = AppAuthorization & {
  readonly sharingRules: SharingRulesApiLike;
};

export interface OrderShare {
  id: number;
  orderId: number;
  sharedWithId: string;
  sharedWithName: string | null;
  sharedById: string | null;
  ruleKey: string;
  createdAt: string;
}

export class ServiceShareError extends Error {
  constructor(
    readonly code:
      'ORDER_NOT_FOUND' | 'CONFIDENTIAL' | 'NOT_FOUND' | 'INVALID_INPUT',
    message: string,
  ) {
    super(message);
    this.name = 'ServiceShareError';
  }
}

function shareRuleKey(orderId: number, userId: string): string {
  return `service-order-share-${orderId}-${userId}`;
}

/**
 * Names the shared order through a parameterised Record Access rather than the
 * built-in `records` selection: the latter carries string ids, and the order
 * table's integer primary key is rejected by the database filter compiler.
 */
function sharedOrderSelection(orderId: number) {
  return selection.recordAccess('service.sharedOrder', { orderId });
}

/**
 * Temporary read-only collaboration for one ordinary order.
 *
 * The grant itself is the built-in sharing rule; this service only owns the
 * link between an order and the engineer it was shared with, so revoking the
 * share removes the rule and the access with it. A confidential order is never
 * shared, and sharing never confers processing rights: it adds records to the
 * `view` action's scope only.
 */
export class ServiceShareService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly authorization: ServiceAuthorization,
  ) {}

  async list(orderId: number): Promise<OrderShare[]> {
    const rows = await this.database
      .query()
      .selectFrom('serviceOrderShares as share')
      .select([
        'share.id as id',
        'share.orderId as orderId',
        'share.sharedWithId as sharedWithId',
        'share.sharedById as sharedById',
        'share.ruleKey as ruleKey',
        'share.createdAt as createdAt',
      ])
      .where('share.orderId', '=', orderId)
      .where('share.revoked', '=', false)
      .orderBy('share.id', 'asc')
      .execute();
    return rows.map((row) => ({
      id: Number(row.id),
      orderId: Number(row.orderId),
      sharedWithId: String(row.sharedWithId),
      sharedWithName: null,
      sharedById: row.sharedById == null ? null : asText(row.sharedById),
      ruleKey: String(row.ruleKey),
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : asText(row.createdAt),
    }));
  }

  async share(
    orderId: number,
    sharedById: string,
    sharedWithId: string,
  ): Promise<OrderShare> {
    if (!sharedWithId || sharedWithId === sharedById) {
      throw new ServiceShareError(
        'INVALID_INPUT',
        '请选择另一位工程师进行临时协作。',
      );
    }
    const order = await this.database
      .query()
      .selectFrom('serviceOrders')
      .select(['id', 'confidential'])
      .where('id', '=', orderId)
      .executeTakeFirst();
    if (!order) {
      throw new ServiceShareError('ORDER_NOT_FOUND', '工单不存在。');
    }
    if (order.confidential) {
      throw new ServiceShareError(
        'CONFIDENTIAL',
        '保密工单不能通过临时协作分享给非负责人。',
      );
    }
    const ruleKey = shareRuleKey(orderId, sharedWithId);
    const now = new Date();
    const existing = await this.database
      .query()
      .selectFrom('serviceOrderShares')
      .select('id')
      .where('orderId', '=', orderId)
      .where('sharedWithId', '=', sharedWithId)
      .executeTakeFirst();

    let id: number;
    if (existing) {
      await this.database
        .query()
        .updateTable('serviceOrderShares')
        .set({ revoked: false, sharedById, ruleKey, updatedAt: now })
        .where('id', '=', existing.id)
        .execute();
      id = Number(existing.id);
    } else {
      const inserted = await this.database
        .query()
        .insertInto('serviceOrderShares')
        .values({
          orderId,
          sharedWithId,
          sharedById,
          ruleKey,
          expiresAt: null,
          revoked: false,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      id = Number(inserted.insertId);
    }

    const rule = defineSharingRule(ruleKey, ordersResource.reference())
      .scope('view', 'orders', sharedOrderSelection(orderId))
      // An observer holds only `viewSummary`, so the same share must open that
      // action too; without it a shared order stays invisible to the observer
      // even though the share exists.
      .scope('viewSummary', 'orders', sharedOrderSelection(orderId))
      .subjects({ type: 'user', id: sharedWithId })
      .reason(`工单 ${orderId} 的临时只读协作`)
      .build();
    const existingRule = await this.authorization.sharingRules.get(ruleKey);
    if (existingRule) {
      await this.authorization.sharingRules.update(ruleKey, rule);
    } else {
      await this.authorization.sharingRules.create(rule);
    }

    return {
      id,
      orderId,
      sharedWithId,
      sharedWithName: null,
      sharedById,
      ruleKey,
      createdAt: now.toISOString(),
    };
  }

  async revoke(orderId: number, shareId: number): Promise<boolean> {
    const row = await this.database
      .query()
      .selectFrom('serviceOrderShares')
      .select(['id', 'ruleKey'])
      .where('id', '=', shareId)
      .where('orderId', '=', orderId)
      .executeTakeFirst();
    if (!row) {
      return false;
    }
    await this.database
      .query()
      .updateTable('serviceOrderShares')
      .set({ revoked: true, updatedAt: new Date() })
      .where('id', '=', shareId)
      .execute();
    await this.authorization.sharingRules.delete(String(row.ruleKey));
    return true;
  }

  async revokeByRuleKey(ruleKey: string): Promise<void> {
    await this.authorization.sharingRules.delete(ruleKey);
  }
}
