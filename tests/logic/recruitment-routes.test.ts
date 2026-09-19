// @vitest-environment node
import type { Auth, AuthEnv } from '@nocobase/app-plugin-authentication';
import type { Context, MiddlewareHandler, Next } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRecruitmentRoutes } from '../../server/routes/recruitment.js';
import { createRecruitmentTestContext } from '../fixtures/recruitment-harness.js';

describe('recruitment routes', () => {
  let context: Awaited<ReturnType<typeof createRecruitmentTestContext>>;
  let router: ReturnType<typeof createRecruitmentRoutes>;
  let userIdByUsername: Record<string, string>;

  beforeEach(async () => {
    context = await createRecruitmentTestContext();
    userIdByUsername = Object.fromEntries(
      Object.entries(context.actorByUsername).map(([username, actor]) => [
        username,
        actor.userId,
      ]),
    );
    userIdByUsername.outsider = context.plainUserId;
    router = createRecruitmentRoutes({
      service: context.service,
      auth: fakeAuth(userIdByUsername),
    });
  });

  afterEach(async () => {
    await context.destroy();
  });

  function get(path: string, username?: string): Promise<Response> {
    return router.request(path, {
      headers: username ? { 'x-test-user': username } : {},
    });
  }

  it('returns 401 for anonymous requests', async () => {
    expect((await get('/stats')).status).toBe(401);
    expect((await get('/candidates')).status).toBe(401);
    expect((await get('/interviews')).status).toBe(401);
  });

  it('returns 403 for a signed-in account without a recruitment role', async () => {
    for (const path of ['/stats', '/candidates', '/interviews', '/positions']) {
      const response = await get(path, 'outsider');
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        code: 'FORBIDDEN',
      });
    }
  });

  it('serves permitted data and scopes it to the caller', async () => {
    const hrResponse = await get('/me', 'hr.manager');
    await expect(hrResponse.json()).resolves.toMatchObject({
      data: { role: 'hr', username: 'hr.manager' },
    });

    const stats = await get('/stats', 'hr.manager');
    expect(stats.status).toBe(200);
    const statsBody = (await stats.json()) as {
      data: { candidates: { total: number } };
    };
    expect(statsBody.data.candidates.total).toBe(12);

    const recruiterCandidates = await get('/candidates', 'recruiter.li');
    const recruiterBody = (await recruiterCandidates.json()) as {
      data: { recruiterUsername: string }[];
    };
    expect(recruiterBody.data).toHaveLength(6);
    expect(
      recruiterBody.data.every(
        (candidate) => candidate.recruiterUsername === 'recruiter.li',
      ),
    ).toBe(true);

    const interviewerInterviews = await get('/interviews', 'interviewer.zhang');
    const interviewBody = (await interviewerInterviews.json()) as {
      data: unknown[];
    };
    expect(interviewBody.data).toHaveLength(4);
  });

  it('filters the interview calendar by the requested range', async () => {
    const withinRange = await get(
      '/interviews?from=2026-09-01T00:00:00.000Z&to=2026-09-30T23:59:59.000Z',
      'hr.manager',
    );
    expect(withinRange.status).toBe(200);
    const withinBody = (await withinRange.json()) as { data: unknown[] };
    expect(withinBody.data).toHaveLength(8);

    const emptyRange = await get(
      '/interviews?from=2026-08-01T00:00:00.000Z&to=2026-08-31T23:59:59.000Z',
      'hr.manager',
    );
    await expect(emptyRange.json()).resolves.toMatchObject({ data: [] });
  });

  it('rejects record-level and role-level violations over HTTP', async () => {
    const wangCandidates = await context.service.listCandidates(
      context.actorByUsername['recruiter.wang'],
    );
    const foreign = wangCandidates[0];

    const foreignResponse = await get(
      `/candidates/${foreign.id}`,
      'recruiter.li',
    );
    expect(foreignResponse.status).toBe(403);

    const statsForInterviewer = await get('/stats', 'interviewer.zhang');
    expect(statsForInterviewer.status).toBe(403);

    const ownedCandidates = await context.service.listCandidates(
      context.actorByUsername['recruiter.li'],
    );
    const pendingOffer = ownedCandidates.find(
      (candidate) => candidate.stage === 'pending_offer',
    );
    expect(pendingOffer).toBeDefined();

    const hire = await router.request(`/candidates/${pendingOffer!.id}/stage`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': 'recruiter.li',
      },
      body: JSON.stringify({ stage: 'offered' }),
    });
    expect(hire.status).toBe(403);
    await expect(hire.json()).resolves.toMatchObject({
      code: 'HIRE_REQUIRES_HR',
    });
  });
});

/**
 * Minimal authentication double: it resolves a header to an account id,
 * mirroring what the real `auth.required()` middleware installs.
 */
function fakeAuth(userIdByUsername: Record<string, string>) {
  const required = (): MiddlewareHandler<AuthEnv> => {
    return async (context: Context<AuthEnv>, next: Next) => {
      const username = context.req.header('x-test-user');
      const userId = username ? userIdByUsername[username] : undefined;
      if (!userId) {
        return context.json({ code: 'UNAUTHENTICATED' }, 401);
      }
      context.set('auth', {
        user: { id: userId },
        session: {},
      } as unknown as AuthEnv['Variables']['auth']);
      await next();
    };
  };
  return { required } as unknown as Pick<Auth, 'required'>;
}
