import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type Auth,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { Hono, type Context } from 'hono';

import {
  RecruitmentError,
  type Actor,
  type RecruitmentService,
} from '../providers/recruitment.js';
import { createRecruitmentServiceForApp } from './recruitment-context.js';

/**
 * Recruitment HTTP API.
 *
 * Every path is mounted under an isolated router whose only middleware is
 * `auth.required()`, so an anonymous request always gets 401 regardless of
 * what other route contributions register. Role and ownership decisions are
 * made by the domain service, never by the client.
 */

export interface RecruitmentRouteDependencies {
  readonly service: RecruitmentService;
  readonly auth: Pick<Auth, 'required'>;
}

export function createRecruitmentRoutes(
  dependencies: RecruitmentRouteDependencies,
): Hono<AuthEnv> {
  const { auth, service } = dependencies;
  const routes = new Hono<AuthEnv>();

  routes.use('*', auth.required());

  const run = (
    context: Context<AuthEnv>,
    handler: (actor: Actor) => Promise<unknown>,
  ) => respond(context, service, handler);

  routes.get('/me', (context) => run(context, async (actor) => actor));
  routes.get('/staff', (context) =>
    run(context, (actor) => service.listStaff(actor)),
  );

  routes.get('/positions', (context) =>
    run(context, (actor) => service.listPositions(actor)),
  );
  routes.post('/positions', (context) =>
    run(context, async (actor) =>
      service.createPosition(actor, await readJson(context)),
    ),
  );
  routes.patch('/positions/:id', (context) =>
    run(context, async (actor) =>
      service.updatePosition(
        actor,
        context.req.param('id'),
        await readJson(context),
      ),
    ),
  );

  routes.get('/candidates', (context) =>
    run(context, (actor) =>
      service.listCandidates(actor, {
        search: queryValue(context, 'search'),
        stage: queryValue(context, 'stage'),
        positionId: queryValue(context, 'positionId'),
        recruiterUsername: queryValue(context, 'recruiterUsername'),
      }),
    ),
  );
  routes.post('/candidates', (context) =>
    run(context, async (actor) =>
      service.createCandidate(actor, await readJson(context)),
    ),
  );
  routes.get('/candidates/:id', (context) =>
    run(context, (actor) =>
      service.getCandidate(actor, context.req.param('id')),
    ),
  );
  routes.patch('/candidates/:id', (context) =>
    run(context, async (actor) =>
      service.updateCandidate(
        actor,
        context.req.param('id'),
        await readJson(context),
      ),
    ),
  );
  routes.post('/candidates/:id/stage', (context) =>
    run(context, async (actor) =>
      service.changeStage(
        actor,
        context.req.param('id'),
        await readJson(context),
      ),
    ),
  );
  routes.post('/candidates/:id/files', (context) =>
    run(context, async (actor) =>
      service.attachCandidateFiles(
        actor,
        context.req.param('id'),
        await readJson(context),
      ),
    ),
  );
  routes.delete('/candidates/:id/files/:fileId', (context) =>
    run(context, async (actor) => {
      await service.removeCandidateFile(
        actor,
        context.req.param('id'),
        context.req.param('fileId'),
      );
      return { id: context.req.param('fileId') };
    }),
  );

  routes.get('/interviews', (context) =>
    run(context, (actor) =>
      service.listInterviews(actor, {
        from: queryValue(context, 'from'),
        to: queryValue(context, 'to'),
        candidateId: queryValue(context, 'candidateId'),
        interviewerUsername: queryValue(context, 'interviewerUsername'),
      }),
    ),
  );
  routes.post('/interviews', (context) =>
    run(context, async (actor) =>
      service.createInterview(actor, await readJson(context)),
    ),
  );
  routes.patch('/interviews/:id', (context) =>
    run(context, async (actor) =>
      service.updateInterview(
        actor,
        context.req.param('id'),
        await readJson(context),
      ),
    ),
  );
  routes.post('/interviews/:id/complete', (context) =>
    run(context, async (actor) =>
      service.completeInterview(
        actor,
        context.req.param('id'),
        await readJson(context),
      ),
    ),
  );

  routes.get('/onboarding', (context) =>
    run(context, (actor) => service.listOnboarding(actor)),
  );
  routes.patch('/onboarding/:id', (context) =>
    run(context, async (actor) =>
      service.setOnboardingStatus(
        actor,
        context.req.param('id'),
        await readJson(context),
      ),
    ),
  );

  routes.get('/stats', (context) =>
    run(context, (actor) => service.stats(actor)),
  );

  return routes;
}

async function respond(
  context: Context<AuthEnv>,
  service: RecruitmentService,
  handler: (actor: Actor) => Promise<unknown>,
): Promise<Response> {
  const session = context.get('auth');
  const userId = session?.user?.id;
  if (!userId) {
    return context.json({ code: 'UNAUTHENTICATED' }, 401);
  }
  try {
    const actor = await service.resolveActor(String(userId));
    const data = await handler(actor);
    return context.json({ data });
  } catch (error: unknown) {
    if (error instanceof RecruitmentError) {
      return context.json(
        { code: error.code, error: error.message },
        error.status as 400,
      );
    }
    throw error;
  }
}

function queryValue(
  context: Context<AuthEnv>,
  name: string,
): string | undefined {
  const value = context.req.query(name);
  return value && value.trim() ? value.trim() : undefined;
}

async function readJson(
  context: Context<AuthEnv>,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

export const recruitmentApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const service = createRecruitmentServiceForApp(app);
    router.route('/recruitment', createRecruitmentRoutes({ service, auth }));
    return router;
  });
