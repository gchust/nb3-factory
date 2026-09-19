import type { Application } from '@nocobase/app-server/application';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import {
  deliveryServiceToken,
  DeliveryError,
  type DeliveryActor,
  type DeliveryService,
} from '../providers/delivery-service.js';

/**
 * Delivery management HTTP API.
 *
 * Identity comes from `auth.required()`; row-level access (which project, task
 * or application a caller may touch) is decided inside the service, where the
 * data is. The routes only parse input and shape responses.
 */
export const deliveryApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<AuthEnv>();
    const auth = app.container.resolve(authenticationToken);
    const service =
      app.container.resolve<DeliveryService>(deliveryServiceToken);

    const routes = new Hono<AuthEnv>();
    routes.use('*', auth.required());

    async function actorOf(context: Context<AuthEnv>): Promise<DeliveryActor> {
      const session = context.get('auth');
      if (!session) {
        throw new DeliveryError('UNAUTHORIZED', '请先登录。', 401);
      }
      return service.resolveActor(session.user.id);
    }

    const run = (
      context: Context<AuthEnv>,
      action: () => Promise<unknown>,
    ): Promise<Response> => respond(context, action);

    const runCreated = (
      context: Context<AuthEnv>,
      action: () => Promise<unknown>,
    ): Promise<Response> => respond(context, action, 201);

    routes.get('/users', (context) =>
      run(context, async () => service.listUsers()),
    );
    routes.get('/me', (context) =>
      run(context, async () => service.me(await actorOf(context))),
    );

    routes.get('/projects', (context) =>
      run(context, async () => service.listProjects(await actorOf(context))),
    );
    routes.post('/projects', (context) =>
      runCreated(context, async () => {
        const actor = await actorOf(context);
        const id = await service.createProject(actor, await readJson(context));
        return { id };
      }),
    );
    routes.get('/projects/:projectId', (context) =>
      run(context, async () =>
        service.getProject(
          await actorOf(context),
          numberParam(context, 'projectId'),
        ),
      ),
    );
    routes.patch('/projects/:projectId', (context) =>
      run(context, async () => {
        const actor = await actorOf(context);
        await service.updateProject(
          actor,
          numberParam(context, 'projectId'),
          await readJson(context),
        );
        return true;
      }),
    );
    routes.post('/projects/:projectId/members', (context) =>
      runCreated(context, async () => {
        const actor = await actorOf(context);
        await service.addMember(
          actor,
          numberParam(context, 'projectId'),
          await readJson(context),
        );
        return true;
      }),
    );
    routes.delete('/projects/:projectId/members/:memberId', (context) =>
      run(context, async () => {
        const actor = await actorOf(context);
        await service.removeMember(
          actor,
          numberParam(context, 'projectId'),
          numberParam(context, 'memberId'),
        );
        return true;
      }),
    );

    routes.get('/projects/:projectId/materials', (context) =>
      run(context, async () =>
        service.listMaterials(
          await actorOf(context),
          numberParam(context, 'projectId'),
        ),
      ),
    );
    routes.post('/projects/:projectId/materials', (context) =>
      runCreated(context, async () => {
        const actor = await actorOf(context);
        await service.createMaterial(
          actor,
          numberParam(context, 'projectId'),
          await readJson(context),
        );
        return true;
      }),
    );
    routes.delete('/materials/:materialId', (context) =>
      run(context, async () => {
        const actor = await actorOf(context);
        await service.removeMaterial(actor, numberParam(context, 'materialId'));
        return true;
      }),
    );
    routes.delete('/materials/:materialId/files/:fileId', (context) =>
      run(context, async () => {
        const actor = await actorOf(context);
        await service.removeMaterialFile(
          actor,
          numberParam(context, 'materialId'),
          context.req.param('fileId'),
        );
        return true;
      }),
    );

    routes.get('/milestones', (context) =>
      run(context, async () => {
        const actor = await actorOf(context);
        const projectId = queryNumber(context, 'projectId');
        return service.listMilestones(
          actor,
          projectId === undefined ? {} : { projectId },
        );
      }),
    );
    routes.post('/milestones', (context) =>
      runCreated(context, async () => {
        const actor = await actorOf(context);
        const id = await service.createMilestone(
          actor,
          await readJson(context),
        );
        return { id };
      }),
    );
    routes.get('/milestones/:milestoneId', (context) =>
      run(context, async () =>
        service.getMilestone(
          await actorOf(context),
          numberParam(context, 'milestoneId'),
        ),
      ),
    );
    routes.get('/milestones/:milestoneId/versions', (context) =>
      run(context, async () =>
        service.milestoneVersions(
          await actorOf(context),
          numberParam(context, 'milestoneId'),
        ),
      ),
    );
    routes.patch('/milestones/:milestoneId', (context) =>
      run(context, async () => {
        const actor = await actorOf(context);
        await service.updateMilestone(
          actor,
          numberParam(context, 'milestoneId'),
          await readJson(context),
        );
        return true;
      }),
    );

    routes.get('/tasks', (context) =>
      run(context, async () => {
        const actor = await actorOf(context);
        const projectId = queryNumber(context, 'projectId');
        const milestoneId = queryNumber(context, 'milestoneId');
        const mine = context.req.query('mine') === 'true';
        return service.listTasks(actor, {
          ...(projectId === undefined ? {} : { projectId }),
          ...(milestoneId === undefined ? {} : { milestoneId }),
          mine,
        });
      }),
    );
    routes.post('/tasks', (context) =>
      runCreated(context, async () => {
        const actor = await actorOf(context);
        const id = await service.createTask(actor, await readJson(context));
        return { id };
      }),
    );
    routes.get('/tasks/:taskId', (context) =>
      run(context, async () =>
        service.getTask(await actorOf(context), numberParam(context, 'taskId')),
      ),
    );
    routes.patch('/tasks/:taskId', (context) =>
      run(context, async () => {
        const actor = await actorOf(context);
        await service.updateTask(
          actor,
          numberParam(context, 'taskId'),
          await readJson(context),
        );
        return true;
      }),
    );

    routes.post('/tasks/:taskId/results', (context) =>
      runCreated(context, async () => {
        const actor = await actorOf(context);
        const id = await service.createResult(
          actor,
          numberParam(context, 'taskId'),
          await readJson(context),
        );
        return { id };
      }),
    );
    routes.post('/results/:resultId/versions', (context) =>
      runCreated(context, async () => {
        const actor = await actorOf(context);
        const id = await service.addResultVersion(
          actor,
          numberParam(context, 'resultId'),
          await readJson(context),
        );
        return { id };
      }),
    );
    routes.delete('/versions/:versionId/files/:fileId', (context) =>
      run(context, async () => {
        const actor = await actorOf(context);
        await service.removeVersionFile(
          actor,
          numberParam(context, 'versionId'),
          context.req.param('fileId'),
        );
        return true;
      }),
    );

    routes.get('/submissions', (context) =>
      run(context, async () => {
        const actor = await actorOf(context);
        const scope = context.req.query('scope');
        return service.listSubmissions(actor, {
          scope:
            scope === 'mine' || scope === 'review' || scope === 'all'
              ? scope
              : 'all',
        });
      }),
    );
    routes.post('/submissions', (context) =>
      runCreated(context, async () => {
        const actor = await actorOf(context);
        const id = await service.createSubmission(
          actor,
          await readJson(context),
        );
        return { id };
      }),
    );
    routes.get('/submissions/:submissionId', (context) =>
      run(context, async () =>
        service.getSubmission(
          await actorOf(context),
          numberParam(context, 'submissionId'),
        ),
      ),
    );
    routes.post('/submissions/:submissionId/decision', (context) =>
      run(context, async () => {
        const actor = await actorOf(context);
        await service.decideSubmission(
          actor,
          numberParam(context, 'submissionId'),
          await readJson(context),
        );
        return true;
      }),
    );

    routes.get('/dashboard', (context) =>
      run(context, async () => service.dashboard(await actorOf(context))),
    );

    router.route('/delivery', routes);
    // The runtime's route factory is typed against the default Hono env; the
    // sub-routers carry the authentication variable for handler typing.
    return router as unknown as Hono;
  });

async function respond(
  context: Context<AuthEnv>,
  action: () => Promise<unknown>,
  status = 200,
): Promise<Response> {
  try {
    const data = await action();
    return context.json({ data }, status as 200);
  } catch (error) {
    if (error instanceof DeliveryError) {
      return context.json(
        { code: error.code, message: error.message },
        error.status as 400,
      );
    }
    throw error;
  }
}

async function readJson(
  context: Context<AuthEnv>,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new DeliveryError('VALIDATION', '请求内容格式不正确。', 400);
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof DeliveryError) throw error;
    throw new DeliveryError('VALIDATION', '请求内容格式不正确。', 400);
  }
}

function numberParam(context: Context<AuthEnv>, name: string): number {
  return Number(context.req.param(name));
}

function queryNumber(
  context: Context<AuthEnv>,
  name: string,
): number | undefined {
  const raw = context.req.query(name);
  if (raw === undefined || raw === '') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}
