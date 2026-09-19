// @vitest-environment node
import { Readable } from 'node:stream';

import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { Auth, AuthEnv } from '@nocobase/app-plugin-authentication';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context, type MiddlewareHandler, type Next } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRecruitmentFileRoutes } from '../../server/routes/recruitment-files.js';
import {
  CANDIDATE_FILE_ACCESS_PATH,
  type Actor,
} from '../../server/providers/recruitment.js';
import { createRecruitmentTestContext } from '../fixtures/recruitment-harness.js';

/**
 * Exercises the real content route wiring under `/uploads/recruitment-files`:
 * the application guard must run before the File Repository streams bytes, and
 * must scope access to the record the file is attached to.
 */
describe('recruitment file content access over HTTP', () => {
  let context: Awaited<ReturnType<typeof createRecruitmentTestContext>>;
  let app: Application;
  let router: Hono;

  beforeEach(async () => {
    context = await createRecruitmentTestContext();
    app = createFakeApp(context);
    router = new Hono();
    for (const contribution of createRecruitmentFileRoutes()) {
      const sub = await contribution.createRouter(app);
      router.route(contribution.scope === 'api' ? '/api' : '/', sub);
    }
  });

  afterEach(async () => {
    await context.destroy();
  });

  function actor(username: string): Actor {
    const found = context.actorByUsername[username];
    if (!found) throw new Error(`Missing actor: ${username}`);
    return found;
  }

  async function attach(
    category: 'resume' | 'portfolio' | 'offer',
    filename: string,
    ext: string,
  ): Promise<string> {
    const candidates = await context.service.listCandidates(
      actor('recruiter.li'),
    );
    const candidateId = candidates[0]!.id;
    const id = crypto.randomUUID();
    await context.database
      .connection()
      .query.insertInto('recruitmentCandidateFiles')
      .values({
        id,
        disk: 'local',
        key: `objects/${id}.${ext}`,
        filename,
        ext,
        mimeType: category === 'portfolio' ? 'image/png' : 'application/pdf',
        size: 2048,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    await context.service.attachCandidateFiles(
      actor('recruiter.li'),
      candidateId,
      {
        category,
        fileIds: [id],
      },
    );
    return id;
  }

  async function get(
    id: string,
    ext: string,
    username?: string,
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (username) headers['x-test-user'] = username;
    return router.request(`${CANDIDATE_FILE_ACCESS_PATH}/${id}.${ext}`, {
      headers,
    });
  }

  it('streams a linked resume to the assigned interviewer', async () => {
    const candidates = await context.service.listCandidates(
      actor('recruiter.li'),
    );
    const candidateId = candidates[0]!.id;
    await context.service.createInterview(actor('recruiter.li'), {
      candidateId,
      interviewerUsername: 'interviewer.zhang',
      scheduledAt: '2026-10-05T02:00:00.000Z',
    });
    const resume = await attach('resume', 'resume.pdf', 'pdf');

    const response = await get(resume, 'pdf', 'interviewer.zhang');
    expect(response.status).toBe(200);
  });

  it('rejects an interviewer reading offer materials by content URL', async () => {
    const candidates = await context.service.listCandidates(
      actor('recruiter.li'),
    );
    const candidateId = candidates[0]!.id;
    await context.service.createInterview(actor('recruiter.li'), {
      candidateId,
      interviewerUsername: 'interviewer.zhang',
      scheduledAt: '2026-10-05T02:00:00.000Z',
    });
    const offer = await attach('offer', 'offer.pdf', 'pdf');

    const response = await get(offer, 'pdf', 'interviewer.zhang');
    expect(response.status).toBe(403);
  });

  it('rejects a recruiter who does not own the candidate', async () => {
    const offer = await attach('offer', 'offer.pdf', 'pdf');
    const response = await get(offer, 'pdf', 'recruiter.wang');
    expect(response.status).toBe(403);
  });

  it('rejects an account with no recruitment role and an anonymous request', async () => {
    const resume = await attach('resume', 'resume.pdf', 'pdf');
    const plain = await router.request(
      `${CANDIDATE_FILE_ACCESS_PATH}/${resume}.pdf`,
      { headers: { 'x-test-user': 'outsider' } },
    );
    expect(plain.status).toBe(403);
    const anonymous = await router.request(
      `${CANDIDATE_FILE_ACCESS_PATH}/${resume}.pdf`,
    );
    expect(anonymous.status).toBe(401);
  });

  function createFakeApp(
    ctx: Awaited<ReturnType<typeof createRecruitmentTestContext>>,
  ): Application {
    const auth = {
      required: (): MiddlewareHandler<AuthEnv> => {
        return async (c: Context<AuthEnv>, next: Next) => {
          const username = c.req.header('x-test-user');
          const found = username ? ctx.actorByUsername[username] : undefined;
          const userId =
            username === 'outsider' ? ctx.plainUserId : found?.userId;
          if (!userId) return c.json({ code: 'UNAUTHENTICATED' }, 401);
          c.set('auth', {
            user: { id: userId },
            session: {},
          } as unknown as AuthEnv['Variables']['auth']);
          await next();
        };
      },
    } as unknown as Pick<Auth, 'required'>;

    const drive = {
      // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix
      use: () => ({
        exists: async (): Promise<boolean> => true,
        getStream: async (): Promise<Readable> =>
          Readable.from([Buffer.from('%PDF-1.4 test')]),
        delete: async (): Promise<void> => undefined,
      }),
    };

    const repository = {
      validateCollection: async (): Promise<void> => undefined,
      findOne: async ({ filter }: { filter: { id: string } }) => {
        const row = await ctx.database
          .connection()
          .query.selectFrom('recruitmentCandidateFiles')
          .selectAll()
          .where('id', '=', filter.id)
          .executeTakeFirst();
        return row ?? null;
      },
      getUrl: (record: { id: string; ext: string }): string =>
        `${CANDIDATE_FILE_ACCESS_PATH}/${record.id}.${record.ext}`,
      getStorageUrl: async (): Promise<string> => 'https://storage.example/',
      uploadOne: async (): Promise<unknown> => {
        throw new Error('not used');
      },
      uploadMany: async (): Promise<unknown> => {
        throw new Error('not used');
      },
    };

    const repositoryManager = {
      repository: () => repository,
    };

    return {
      publicBasePath: '',
      container: {
        resolve: (token: unknown) => {
          if (token === authenticationToken) return auth;
          if (token === driveManagerToken) return drive;
          if (token === databaseManagerToken) return ctx.database;
          if (token === authorizationToken) return ctx.authorization;
          if (token === serverFileRepositoryManagerToken) {
            return repositoryManager;
          }
          throw new Error('Unexpected service token');
        },
      },
    } as unknown as Application;
  }
});
