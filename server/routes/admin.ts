import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
  emptyResponse,
  listResponse,
} from '@nocobase/app-server/router';
import type { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';

import {
  documentCenterServiceToken,
  type DocumentCenterService,
} from '../providers/document-center.js';
import {
  BackupImpactSchema,
  BackupParams,
  BackupRestoreResultSchema,
  BackupSchema,
  CreateBackupInput,
  CreateDepartmentInput,
  CreateMemberInput,
  DepartmentMemberSchema,
  DepartmentParams,
  DepartmentSchema,
  DirectoryUsersQuery,
  DirectoryUserSchema,
  MemberParams,
  RestoreBackupInput,
  UpdateDepartmentInput,
} from './schemas.js';
import {
  documentCenterErrorHandler,
  requireManage,
  type DocumentCenterEnv,
} from './shared.js';

const tags = ['Document Center'];

/**
 * The Document Center administration API: departments and their members, the
 * account directory the member picker reads, and the backup and restore of the
 * whole center. Every route requires the `manage` action.
 *
 * Each prefix is its own sub-router so its `use('*')` middleware is scoped to
 * that prefix and cannot reach a contribution mounted elsewhere.
 */
export function createAdminRouter(
  container: ServiceContainer,
): Hono<DocumentCenterEnv> {
  const router = new Hono<DocumentCenterEnv>();
  const authentication = container.resolve(authenticationToken);
  const authorization = container.resolve(authorizationToken);
  const documents = container.resolve<DocumentCenterService>(
    documentCenterServiceToken,
  );

  const guard = () =>
    new Hono<DocumentCenterEnv>()
      .onError(documentCenterErrorHandler)
      .use(
        '*',
        authentication.required(),
        authorization.middleware(),
        requireManage(),
      );

  const departments = guard();
  departments.get(
    '/',
    describeRoute({
      tags,
      summary: 'List departments',
      operationId: 'documentCenterListDepartments',
      responses: {
        200: listResponse(DepartmentSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) =>
      context.json({ data: await documents.listDepartments() }),
  );
  departments.post(
    '/',
    describeRoute({
      tags,
      summary: 'Create a department',
      operationId: 'documentCenterCreateDepartment',
      responses: {
        201: dataResponse(DepartmentSchema),
        ...apiErrorResponses,
        409: apiErrorResponse(
          409,
          'A department with this code already exists (`DEPARTMENT_CODE_TAKEN`).',
        ),
      },
    }),
    apiValidator('json', CreateDepartmentInput),
    async (context) => {
      const department = await documents.createDepartment({
        values: context.req.valid('json'),
      });
      return context.json({ data: department }, 201);
    },
  );
  departments.patch(
    '/:departmentId',
    describeRoute({
      tags,
      summary: 'Update a department',
      operationId: 'documentCenterUpdateDepartment',
      responses: {
        200: dataResponse(DepartmentSchema),
        ...apiErrorResponses,
        404: apiErrorResponse(
          404,
          'No such department (`DEPARTMENT_NOT_FOUND`).',
        ),
      },
    }),
    apiValidator('param', DepartmentParams),
    apiValidator('json', UpdateDepartmentInput),
    async (context) => {
      const { departmentId } = context.req.valid('param');
      const department = await documents.updateDepartment({
        departmentId,
        values: context.req.valid('json'),
      });
      return context.json({ data: department });
    },
  );
  departments.get(
    '/:departmentId/members',
    describeRoute({
      tags,
      summary: 'List a department’s members',
      operationId: 'documentCenterListDepartmentMembers',
      responses: {
        200: listResponse(DepartmentMemberSchema),
        ...apiErrorResponses,
        404: apiErrorResponse(
          404,
          'No such department (`DEPARTMENT_NOT_FOUND`).',
        ),
      },
    }),
    apiValidator('param', DepartmentParams),
    async (context) => {
      const { departmentId } = context.req.valid('param');
      return context.json({
        data: await documents.listMembers(departmentId),
      });
    },
  );

  const members = guard();
  members.post(
    '/',
    describeRoute({
      tags,
      summary: 'Add a member to a department',
      operationId: 'documentCenterAddDepartmentMember',
      responses: {
        201: dataResponse(DepartmentMemberSchema),
        ...apiErrorResponses,
        404: apiErrorResponse(
          404,
          'No such department (`DEPARTMENT_NOT_FOUND`).',
        ),
        409: apiErrorResponse(
          409,
          'The user already belongs to the department (`DEPARTMENT_MEMBER_EXISTS`).',
        ),
      },
    }),
    apiValidator('json', CreateMemberInput),
    async (context) => {
      const input = context.req.valid('json');
      const member = await documents.addMember(input);
      return context.json({ data: member }, 201);
    },
  );
  members.delete(
    '/:memberId',
    describeRoute({
      tags,
      summary: 'Remove a department member',
      operationId: 'documentCenterRemoveDepartmentMember',
      responses: {
        204: emptyResponse('The membership was removed.'),
        ...apiErrorResponses,
        404: apiErrorResponse(
          404,
          'No such membership (`DEPARTMENT_MEMBER_NOT_FOUND`).',
        ),
      },
    }),
    apiValidator('param', MemberParams),
    async (context) => {
      const { memberId } = context.req.valid('param');
      await documents.removeMember(memberId);
      return context.body(null, 204);
    },
  );

  const directory = guard();
  directory.get(
    '/',
    describeRoute({
      tags,
      summary: 'List accounts that can be added to a department',
      operationId: 'documentCenterListDirectoryUsers',
      description:
        'Enabled accounts only, with `q` matching name, username or email.',
      responses: {
        200: listResponse(DirectoryUserSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('query', DirectoryUsersQuery),
    async (context) => {
      const query = context.req.valid('query');
      return context.json({
        data: await documents.listDirectoryUsers({
          search: query.q,
          limit: query.limit,
        }),
      });
    },
  );

  const backups = guard();
  backups.get(
    '/',
    describeRoute({
      tags,
      summary: 'List backups',
      operationId: 'documentCenterListBackups',
      description: 'Newest first. The snapshot itself is not returned here.',
      responses: {
        200: listResponse(BackupSchema),
        ...apiErrorResponses,
      },
    }),
    async (context) => context.json({ data: await documents.listBackups() }),
  );
  backups.post(
    '/',
    describeRoute({
      tags,
      summary: 'Back up the document center',
      operationId: 'documentCenterCreateBackup',
      description:
        'Stores a snapshot of every document, its versions and the department visibility links.',
      responses: {
        201: dataResponse(BackupSchema),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', CreateBackupInput),
    async (context) => {
      const actorId = context.get('authz').identity.principal.id;
      const backup = await documents.createBackup({
        actorId,
        title: context.req.valid('json').title,
      });
      return context.json({ data: backup }, 201);
    },
  );
  backups.delete(
    '/:backupId',
    describeRoute({
      tags,
      summary: 'Delete a backup',
      operationId: 'documentCenterDeleteBackup',
      responses: {
        204: emptyResponse('The backup was deleted.'),
        ...apiErrorResponses,
        404: apiErrorResponse(404, 'No such backup (`BACKUP_NOT_FOUND`).'),
      },
    }),
    apiValidator('param', BackupParams),
    async (context) => {
      const { backupId } = context.req.valid('param');
      await documents.deleteBackup(backupId);
      return context.body(null, 204);
    },
  );
  backups.get(
    '/:backupId/impact',
    describeRoute({
      tags,
      summary: 'Show what restoring a backup would change',
      operationId: 'documentCenterGetBackupImpact',
      description:
        'The documents a restore would create, update, bring back or remove, and the counts of each, so an administrator can confirm before restoring.',
      responses: {
        200: dataResponse(BackupImpactSchema),
        ...apiErrorResponses,
        404: apiErrorResponse(404, 'No such backup (`BACKUP_NOT_FOUND`).'),
      },
    }),
    apiValidator('param', BackupParams),
    async (context) => {
      const { backupId } = context.req.valid('param');
      return context.json({
        data: await documents.getBackupImpact(backupId),
      });
    },
  );
  backups.post(
    '/:backupId/restore',
    describeRoute({
      tags,
      summary: 'Restore a backup',
      operationId: 'documentCenterRestoreBackup',
      description:
        'Replaces the whole document center with the backup. Requires `confirm: true`; call the impact route first to see what changes.',
      responses: {
        200: dataResponse(BackupRestoreResultSchema),
        ...apiErrorResponses,
        400: apiErrorResponse(
          400,
          'The restore was not confirmed (`RESTORE_CONFIRMATION_REQUIRED`).',
        ),
        404: apiErrorResponse(404, 'No such backup (`BACKUP_NOT_FOUND`).'),
      },
    }),
    apiValidator('param', BackupParams),
    apiValidator('json', RestoreBackupInput),
    async (context) => {
      const { backupId } = context.req.valid('param');
      const result = await documents.restoreBackup({
        actorId: context.get('authz').identity.principal.id,
        backupId,
      });
      return context.json({ data: result });
    },
  );

  router.route('/departments', departments);
  router.route('/departmentMembers', members);
  router.route('/directoryUsers', directory);
  router.route('/documentBackups', backups);
  return router;
}
