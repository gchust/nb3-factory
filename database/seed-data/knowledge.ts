import { selection } from '@nocobase/authorization/core';
import type { PermissionGrant } from '@nocobase/authorization/core';
import {
  KNOWLEDGE_ASSISTANT_PAGE,
  KNOWLEDGE_MATERIALS_PAGE,
  knowledgeMaterialsReference,
} from '../../server/knowledge/resources.ts';

/**
 * The fixtures and stored grants the knowledge feature installs, kept here so the seed that writes them and any test
 * that reads them name the same values.
 *
 * This module is installation data, not schema. The values are fixed on purpose: the colleague's record scope names
 * the two materials it may read by identifier, so the identifiers must not change between runs, and a fixed
 * distinction between the two test people is what makes the permission difference reproducible.
 *
 * A material has only the two content items the requirement describes. Which materials a person may read is not part
 * of the record — it is a `materials` data scope inside the permission-set grant below, which is why the colleague's
 * grant lists two records and the supervisor's selects `all`.
 */

/** The two business pages this feature contributes, granted to both roles. */
export const KNOWLEDGE_PAGE_IDS = [
  KNOWLEDGE_MATERIALS_PAGE,
  KNOWLEDGE_ASSISTANT_PAGE,
] as const;

export const KNOWLEDGE_SUPERVISOR_SET = 'knowledge-supervisor';
export const KNOWLEDGE_COLLEAGUE_SET = 'knowledge-colleague';

export interface KnowledgeFixtureMaterial {
  readonly id: string;
  readonly title: string;
  readonly content: string;
}

/**
 * The three fictional materials the task names. A and B are readable by a colleague; C is reachable only through the
 * supervisor set's `all` scope, so it is absent from a colleague's list, from a direct read of its id, and from
 * anything the assistant can retrieve on their behalf.
 */
export const KNOWLEDGE_MATERIALS: readonly KnowledgeFixtureMaterial[] = [
  {
    id: 'knowledge-material-a',
    title: '蓝鹭设备报修电话',
    content: '蓝鹭设备报修电话为 400-000-7316',
  },
  {
    id: 'knowledge-material-b',
    title: '蓝鹭设备常规巡检间隔',
    content: '蓝鹭设备常规巡检间隔为 45 天',
  },
  {
    id: 'knowledge-material-c',
    title: '保密项目内部代号',
    content: '保密项目的内部代号为墨竹 729',
  },
];

/** The two materials a colleague may read. */
export const KNOWLEDGE_COLLEAGUE_MATERIAL_IDS: readonly string[] = [
  'knowledge-material-a',
  'knowledge-material-b',
];

export interface KnowledgeFixtureUser {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly name: string;
  readonly password: string;
  readonly permissionSet: string;
}

/**
 * Two isolated accounts: one may edit every material, one may read only the two above. They share no role other than
 * the built-in `member` set every signed-in subject already holds, so the difference measured is this feature's.
 */
export const KNOWLEDGE_USERS: readonly KnowledgeFixtureUser[] = [
  {
    id: 'knowledge-user-supervisor',
    username: 'supervisor',
    email: 'supervisor@example.com',
    name: 'Knowledge Supervisor',
    password: 'Supervisor123!',
    permissionSet: KNOWLEDGE_SUPERVISOR_SET,
  },
  {
    id: 'knowledge-user-colleague',
    username: 'colleague',
    email: 'colleague@example.com',
    name: 'Knowledge Colleague',
    password: 'Colleague123!',
    permissionSet: KNOWLEDGE_COLLEAGUE_SET,
  },
];

/**
 * A page `access` grant, in the shape the authorization layer's page plugin writes.
 *
 * A seed has no authorization service to build this with, and the shape is the stored contract: `page` is a
 * registered resource type whose only action is `access`, and a client route's `authz` declaration is what looks the
 * grant up. Keeping the literal here is what lets a page be granted before the application first starts.
 */
export function pageAccessGrant(pageId: string): PermissionGrant {
  return {
    resource: { type: 'page', id: pageId },
    actions: [{ action: 'access' }],
  };
}

/** The grants for a person who may read and maintain every material. */
export function knowledgeSupervisorGrants(): readonly PermissionGrant[] {
  const reference = knowledgeMaterialsReference();
  return [
    ...KNOWLEDGE_PAGE_IDS.map(pageAccessGrant),
    reference.grant({
      view: { materials: selection.all() },
      edit: { materials: selection.all() },
    }),
  ];
}

/** The grants for a person who may read exactly the named materials and may not change any of them. */
export function knowledgeColleagueGrants(
  materialIds: readonly string[] = KNOWLEDGE_COLLEAGUE_MATERIAL_IDS,
): readonly PermissionGrant[] {
  const reference = knowledgeMaterialsReference();
  return [
    ...KNOWLEDGE_PAGE_IDS.map(pageAccessGrant),
    reference.grant({
      view: { materials: selection.records(materialIds) },
    }),
  ];
}
