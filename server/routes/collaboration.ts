import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  emptyResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import {
  ProjectCollaborationError,
  projectsServiceToken,
} from '../providers/projects.js';
import {
  AddMemberInput,
  CollaboratorSchema,
  CreateMilestoneInput,
  CreateProjectInput,
  CreateTaskInput,
  DashboardSchema,
  DeliverableParams,
  DeliverableSchema,
  MilestoneParams,
  MilestoneSchema,
  MemberParams,
  MemberSchema,
  ProjectDetailSchema,
  ProjectParams,
  ProjectSchema,
  RejectDeliverableInput,
  ShareDeliverableInput,
  ShareParams,
  ShareSchema,
  SubmitDeliverableInput,
  TaskParams,
  TaskSchema,
  UpdateMilestoneInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from './schemas.js';
import { z } from 'zod';

const DOMAIN = 'projectCollaboration';

export function toApiError(error: ProjectCollaborationError): ApiError {
  return new ApiError({
    status: error.status,
    reason: error.reason,
    domain: DOMAIN,
    message: error.message,
    fieldViolations:
      error.fieldViolations.length > 0 ? error.fieldViolations : undefined,
  });
}

export const collaborationApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    // The authenticated half is its own router typed with `AuthEnv`; the outer router is what a contribution must
    // return, and it never sees the route handlers.
    const router = new Hono<AuthEnv>();
    const root = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(projectsServiceToken);

    // Middleware is scoped to the literal segments this router owns so it cannot
    // reach any other contribution mounted at `/api`.
    for (const path of [
      '/projects',
      '/projects/*',
      '/milestones/*',
      '/tasks/*',
      '/deliverables/*',
      '/projectCollaborators',
    ]) {
      router.use(path, auth.required());
    }

    root.onError((error, context) =>
      apiErrorHandler(
        error instanceof ProjectCollaborationError ? toApiError(error) : error,
        context,
      ),
    );

    const actorId = (context: Context<AuthEnv>): string =>
      context.get('auth')!.user.id;

    // --- Projects ----------------------------------------------------------

    router.get(
      '/projects',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'List the projects the caller participates in',
        operationId: 'listProjects',
        responses: {
          '200': dataResponse(z.array(ProjectSchema)),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      async (context) =>
        context.json({ data: await service.listProjects(actorId(context)) }),
    );

    router.post(
      '/projects',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Create a project',
        operationId: 'createProject',
        responses: {
          '201': dataResponse(ProjectSchema),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateProjectInput),
      async (context) =>
        context.json(
          {
            data: await service.createProject(
              actorId(context),
              context.req.valid('json'),
            ),
          },
          201,
        ),
    );

    router.get(
      '/projects/dashboard',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Project progress and the caller\u2019s personal to-dos',
        operationId: 'getProjectDashboard',
        responses: {
          '200': dataResponse(DashboardSchema),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      async (context) =>
        context.json({ data: await service.getDashboard(actorId(context)) }),
    );

    router.get(
      '/projects/:projectId',
      describeRoute({
        tags: ['Project collaboration'],
        summary:
          'Read one project with its members, milestones, tasks and deliverables',
        operationId: 'getProject',
        responses: {
          '200': dataResponse(ProjectDetailSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', ProjectParams),
      async (context) => {
        const { projectId } = context.req.valid('param');
        return context.json({
          data: await service.getProject(projectId, actorId(context)),
        });
      },
    );

    router.patch(
      '/projects/:projectId',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Update a project',
        operationId: 'updateProject',
        responses: {
          '200': dataResponse(ProjectSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', ProjectParams),
      apiValidator('json', UpdateProjectInput),
      async (context) => {
        const { projectId } = context.req.valid('param');
        return context.json({
          data: await service.updateProject(
            projectId,
            actorId(context),
            context.req.valid('json'),
          ),
        });
      },
    );

    router.delete(
      '/projects/:projectId',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Delete a project and everything under it',
        operationId: 'deleteProject',
        responses: { '204': emptyResponse(), ...apiErrorResponses },
      }),
      apiValidator('param', ProjectParams),
      async (context) => {
        const { projectId } = context.req.valid('param');
        await service.deleteProject(projectId, actorId(context));
        return context.body(null, 204);
      },
    );

    router.post(
      '/projects/:projectId/members',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Add a member to a project',
        operationId: 'addProjectMember',
        responses: {
          '201': dataResponse(MemberSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', ProjectParams),
      apiValidator('json', AddMemberInput),
      async (context) => {
        const { projectId } = context.req.valid('param');
        const { userId, role } = context.req.valid('json');
        return context.json(
          {
            data: await service.addMember(
              projectId,
              actorId(context),
              userId,
              role,
            ),
          },
          201,
        );
      },
    );

    router.delete(
      '/projects/:projectId/members/:userId',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Remove a member from a project',
        operationId: 'removeProjectMember',
        responses: { '204': emptyResponse(), ...apiErrorResponses },
      }),
      apiValidator('param', MemberParams),
      async (context) => {
        const { projectId, userId } = context.req.valid('param');
        await service.removeMember(projectId, actorId(context), userId);
        return context.body(null, 204);
      },
    );

    router.get(
      '/projectCollaborators',
      describeRoute({
        tags: ['Project collaboration'],
        summary:
          'List people who can be added to a project, assigned a task or shared a deliverable',
        operationId: 'listCollaborators',
        responses: {
          '200': dataResponse(z.array(CollaboratorSchema)),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator(
        'query',
        z.object({ search: z.string().max(200).optional() }),
      ),
      async (context) => {
        const { search } = context.req.valid('query');
        return context.json({ data: await service.listCollaborators(search) });
      },
    );

    // --- Milestones --------------------------------------------------------

    router.post(
      '/projects/:projectId/milestones',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Create a milestone',
        operationId: 'createMilestone',
        responses: {
          '201': dataResponse(MilestoneSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', ProjectParams),
      apiValidator('json', CreateMilestoneInput),
      async (context) => {
        const { projectId } = context.req.valid('param');
        return context.json(
          {
            data: await service.createMilestone(
              projectId,
              actorId(context),
              context.req.valid('json'),
            ),
          },
          201,
        );
      },
    );

    router.patch(
      '/milestones/:milestoneId',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Update a milestone',
        operationId: 'updateMilestone',
        responses: {
          '200': dataResponse(MilestoneSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', MilestoneParams),
      apiValidator('json', UpdateMilestoneInput),
      async (context) => {
        const { milestoneId } = context.req.valid('param');
        return context.json({
          data: await service.updateMilestone(
            milestoneId,
            actorId(context),
            context.req.valid('json'),
          ),
        });
      },
    );

    router.post(
      '/milestones/:milestoneId/complete',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Complete a milestone',
        description:
          'Refused with `MILESTONE_HAS_UNFINISHED_TASKS` while a required task in the milestone is not completed.',
        operationId: 'completeMilestone',
        responses: {
          '200': dataResponse(MilestoneSchema),
          ...apiErrorResponses,
          '400': apiErrorResponse(400, 'A required task is still unfinished.'),
        },
      }),
      apiValidator('param', MilestoneParams),
      async (context) => {
        const { milestoneId } = context.req.valid('param');
        return context.json({
          data: await service.completeMilestone(milestoneId, actorId(context)),
        });
      },
    );

    router.delete(
      '/milestones/:milestoneId',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Delete a milestone',
        operationId: 'deleteMilestone',
        responses: { '204': emptyResponse(), ...apiErrorResponses },
      }),
      apiValidator('param', MilestoneParams),
      async (context) => {
        const { milestoneId } = context.req.valid('param');
        await service.deleteMilestone(milestoneId, actorId(context));
        return context.body(null, 204);
      },
    );

    // --- Tasks -------------------------------------------------------------

    router.post(
      '/projects/:projectId/tasks',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Create a task',
        operationId: 'createTask',
        responses: { '201': dataResponse(TaskSchema), ...apiErrorResponses },
      }),
      apiValidator('param', ProjectParams),
      apiValidator('json', CreateTaskInput),
      async (context) => {
        const { projectId } = context.req.valid('param');
        return context.json(
          {
            data: await service.createTask(
              projectId,
              actorId(context),
              context.req.valid('json'),
            ),
          },
          201,
        );
      },
    );

    router.get(
      '/tasks/:taskId',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Read one task',
        operationId: 'getTask',
        responses: { '200': dataResponse(TaskSchema), ...apiErrorResponses },
      }),
      apiValidator('param', TaskParams),
      async (context) => {
        const { taskId } = context.req.valid('param');
        return context.json({
          data: await service.getTask(taskId, actorId(context)),
        });
      },
    );

    router.patch(
      '/tasks/:taskId',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Update a task or move it to another status',
        operationId: 'updateTask',
        responses: { '200': dataResponse(TaskSchema), ...apiErrorResponses },
      }),
      apiValidator('param', TaskParams),
      apiValidator('json', UpdateTaskInput),
      async (context) => {
        const { taskId } = context.req.valid('param');
        return context.json({
          data: await service.updateTask(
            taskId,
            actorId(context),
            context.req.valid('json'),
          ),
        });
      },
    );

    router.delete(
      '/tasks/:taskId',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Delete a task',
        operationId: 'deleteTask',
        responses: { '204': emptyResponse(), ...apiErrorResponses },
      }),
      apiValidator('param', TaskParams),
      async (context) => {
        const { taskId } = context.req.valid('param');
        await service.deleteTask(taskId, actorId(context));
        return context.body(null, 204);
      },
    );

    // --- Deliverables ------------------------------------------------------

    router.post(
      '/tasks/:taskId/deliverables',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Submit a deliverable for a task',
        description:
          'Submitting moves the task to `pending_acceptance`. The deliverable is the unit the project owner accepts or rejects.',
        operationId: 'submitDeliverable',
        responses: {
          '201': dataResponse(DeliverableSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', TaskParams),
      apiValidator('json', SubmitDeliverableInput),
      async (context) => {
        const { taskId } = context.req.valid('param');
        return context.json(
          {
            data: await service.submitDeliverable(
              taskId,
              actorId(context),
              context.req.valid('json'),
            ),
          },
          201,
        );
      },
    );

    router.get(
      '/deliverables/:deliverableId',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Read one deliverable with its shares',
        operationId: 'getDeliverable',
        responses: {
          '200': dataResponse(DeliverableSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', DeliverableParams),
      async (context) => {
        const { deliverableId } = context.req.valid('param');
        return context.json({
          data: await service.getDeliverable(deliverableId, actorId(context)),
        });
      },
    );

    router.post(
      '/deliverables/:deliverableId/accept',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Accept a pending deliverable',
        operationId: 'acceptDeliverable',
        responses: {
          '200': dataResponse(DeliverableSchema),
          ...apiErrorResponses,
          '400': apiErrorResponse(400, 'The deliverable is not pending.'),
        },
      }),
      apiValidator('param', DeliverableParams),
      async (context) => {
        const { deliverableId } = context.req.valid('param');
        return context.json({
          data: await service.acceptDeliverable(
            deliverableId,
            actorId(context),
          ),
        });
      },
    );

    router.post(
      '/deliverables/:deliverableId/reject',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Reject a pending deliverable with a reason',
        operationId: 'rejectDeliverable',
        responses: {
          '200': dataResponse(DeliverableSchema),
          ...apiErrorResponses,
          '400': apiErrorResponse(
            400,
            'The deliverable is not pending, or no reason was given.',
          ),
        },
      }),
      apiValidator('param', DeliverableParams),
      apiValidator('json', RejectDeliverableInput),
      async (context) => {
        const { deliverableId } = context.req.valid('param');
        return context.json({
          data: await service.rejectDeliverable(
            deliverableId,
            actorId(context),
            context.req.valid('json').reason,
          ),
        });
      },
    );

    router.post(
      '/deliverables/:deliverableId/shares',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Share a deliverable with a colleague',
        operationId: 'shareDeliverable',
        responses: { '201': dataResponse(ShareSchema), ...apiErrorResponses },
      }),
      apiValidator('param', DeliverableParams),
      apiValidator('json', ShareDeliverableInput),
      async (context) => {
        const { deliverableId } = context.req.valid('param');
        return context.json(
          {
            data: await service.shareDeliverable(
              deliverableId,
              actorId(context),
              context.req.valid('json').userId,
            ),
          },
          201,
        );
      },
    );

    router.delete(
      '/deliverables/:deliverableId/shares/:shareId',
      describeRoute({
        tags: ['Project collaboration'],
        summary: 'Revoke a deliverable share so access stops immediately',
        operationId: 'revokeDeliverableShare',
        responses: { '204': emptyResponse(), ...apiErrorResponses },
      }),
      apiValidator('param', ShareParams),
      async (context) => {
        const { deliverableId, shareId } = context.req.valid('param');
        await service.revokeDeliverableShare(
          deliverableId,
          actorId(context),
          shareId,
        );
        return context.body(null, 204);
      },
    );

    root.route('/', router);
    return root;
  });
