import { selection } from '@nocobase/authorization/core';
import { defineDefaultAccessRule } from '@nocobase/authorization/default-access';
import { defineRestrictionRule } from '@nocobase/authorization/restriction-rules';

import {
  serviceKnowledge,
  serviceWorkOrders,
} from '../../server/service/resources.ts';

/**
 * Authorization baselines persisted by the installation seed. They use the
 * application's existing default-access and restriction-rule capabilities
 * rather than a parallel permission check.
 *
 * - The default-access rules state the fallback selection for a holder whose
 *   grant sets no scope on that branch: ordinary records only.
 * - The restriction rule narrows the `share` branch so a confidential work
 *   order can never be handed to another engineer, whoever asks.
 */
export const serviceDefaultAccessRules = [
  defineDefaultAccessRule(
    'service-work-order-baseline',
    serviceWorkOrders.reference(),
  )
    .scope(
      'view',
      'orders',
      selection.recordAccess('service.orderNonConfidential'),
    )
    .build(),
  defineDefaultAccessRule(
    'service-knowledge-baseline',
    serviceKnowledge.reference(),
  )
    .scope(
      'view',
      'articles',
      selection.recordAccess('service.publishedKnowledge'),
    )
    .build(),
];

export const serviceRestrictionRules = [
  defineRestrictionRule(
    'service-confidential-not-shareable',
    serviceWorkOrders.reference(),
  )
    .title('涉密工单不可共享')
    .scope(
      'share',
      'orders',
      selection.recordAccess('service.orderNonConfidential'),
    )
    .reason('Confidential work orders may not be shared with another engineer.')
    .build(),
];
