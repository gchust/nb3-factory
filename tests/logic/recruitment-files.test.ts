// @vitest-environment node
import type { Auth, AuthEnv } from '@nocobase/app-plugin-authentication';
import type { Context, MiddlewareHandler, Next } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRecruitmentRoutes } from '../../server/routes/recruitment.js';
import {
  RecruitmentError,
  type Actor,
} from '../../server/providers/recruitment.js';
import { createRecruitmentTestContext } from '../fixtures/recruitment-harness.js';

describe('recruitment candidate files', () => {
  let context: Awaited<ReturnType<typeof createRecruitmentTestContext>>;

  beforeEach(async () => {
    context = await createRecruitmentTestContext();
  });

  afterEach(async () => {
    await context.destroy();
  });

  function actor(username: string): Actor {
    const found = context.actorByUsername[username];
    if (!found) throw new Error(`Missing actor: ${username}`);
    return found;
  }

  async function insertUploadedFile(
    filename: string,
    ext = 'pdf',
    mimeType = 'application/pdf',
    size = 2048,
  ): Promise<string> {
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
        mimeType,
        size,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    return id;
  }

  async function ownedCandidateId(username: string): Promise<string> {
    const candidates = await context.service.listCandidates(actor(username));
    const candidate = candidates[0];
    if (!candidate) throw new Error('No candidate for ' + username);
    return candidate.id;
  }

  it('attaches a resume, then keeps the previous version when it is replaced', async () => {
    const candidateId = await ownedCandidateId('recruiter.li');
    const first = await insertUploadedFile('resume-v1.pdf');
    const second = await insertUploadedFile('resume-v2.pdf');

    await context.service.attachCandidateFiles(
      actor('recruiter.li'),
      candidateId,
      {
        category: 'resume',
        fileIds: [first],
      },
    );
    await context.service.attachCandidateFiles(
      actor('recruiter.li'),
      candidateId,
      {
        category: 'resume',
        fileIds: [second],
      },
    );

    const detail = await context.service.getCandidate(
      actor('recruiter.li'),
      candidateId,
    );
    const resumes = detail.files.filter((file) => file.category === 'resume');
    expect(resumes).toHaveLength(2);
    const active = resumes.find((file) => !file.superseded);
    const superseded = resumes.find((file) => file.superseded);
    expect(active?.id).toBe(second);
    expect(active?.version).toBe(2);
    expect(superseded?.id).toBe(first);
    expect(superseded?.version).toBe(1);
    expect(active?.contentUrl).toContain(
      `/uploads/recruitment-files/${second}.pdf`,
    );
  });

  it('records the resume version an interview referenced when it was scheduled', async () => {
    const candidateId = await ownedCandidateId('recruiter.li');
    const first = await insertUploadedFile('resume-v1.pdf');
    await context.service.attachCandidateFiles(
      actor('recruiter.li'),
      candidateId,
      {
        category: 'resume',
        fileIds: [first],
      },
    );
    const before = await context.service.createInterview(
      actor('recruiter.li'),
      {
        candidateId,
        interviewerUsername: 'interviewer.zhang',
        scheduledAt: '2026-10-01T02:00:00.000Z',
        method: 'video',
      },
    );
    expect(before.resumeVersion).toBe(1);
    expect(before.resumeFileId).toBe(first);

    const second = await insertUploadedFile('resume-v2.pdf');
    await context.service.attachCandidateFiles(
      actor('recruiter.li'),
      candidateId,
      {
        category: 'resume',
        fileIds: [second],
      },
    );
    const after = await context.service.createInterview(actor('recruiter.li'), {
      candidateId,
      interviewerUsername: 'interviewer.chen',
      scheduledAt: '2026-10-02T02:00:00.000Z',
      method: 'video',
    });
    expect(after.resumeVersion).toBe(2);
    expect(after.resumeFileId).toBe(second);
  });

  it('denies attaching files to another recruiter’s candidate', async () => {
    const candidateId = await ownedCandidateId('recruiter.wang');
    const fileId = await insertUploadedFile('resume.pdf');
    await expect(
      context.service.attachCandidateFiles(actor('recruiter.li'), candidateId, {
        category: 'resume',
        fileIds: [fileId],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('never shows offer materials to an interviewer, seeded or not', async () => {
    const candidateId = await ownedCandidateId('recruiter.li');
    const resume = await insertUploadedFile('resume.pdf');
    const portfolio = await insertUploadedFile('work.png', 'png', 'image/png');
    const offer = await insertUploadedFile('offer.pdf');
    for (const [category, fileId] of [
      ['resume', resume],
      ['portfolio', portfolio],
      ['offer', offer],
    ] as const) {
      await context.service.attachCandidateFiles(
        actor('recruiter.li'),
        candidateId,
        {
          category,
          fileIds: [fileId],
        },
      );
    }
    // Assign the candidate to interviewer.zhang so the candidate is visible.
    await context.service.createInterview(actor('recruiter.li'), {
      candidateId,
      interviewerUsername: 'interviewer.zhang',
      scheduledAt: '2026-10-03T02:00:00.000Z',
    });

    const detail = await context.service.getCandidate(
      actor('interviewer.zhang'),
      candidateId,
    );
    const categories = detail.files.map((file) => file.category).sort();
    expect(categories).toEqual(['portfolio', 'resume']);

    await expect(
      context.service.assertFileContentAccess(
        actor('interviewer.zhang'),
        offer,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      context.service.assertFileContentAccess(
        actor('interviewer.zhang'),
        resume,
      ),
    ).resolves.toBeUndefined();
  });

  it('scopes content access to the candidate’s recruiter and the HR manager', async () => {
    const candidateId = await ownedCandidateId('recruiter.li');
    const fileId = await insertUploadedFile('resume.pdf');
    await context.service.attachCandidateFiles(
      actor('recruiter.li'),
      candidateId,
      {
        category: 'resume',
        fileIds: [fileId],
      },
    );

    await expect(
      context.service.assertFileContentAccess(actor('recruiter.li'), fileId),
    ).resolves.toBeUndefined();
    await expect(
      context.service.assertFileContentAccess(actor('hr.manager'), fileId),
    ).resolves.toBeUndefined();
    await expect(
      context.service.assertFileContentAccess(actor('recruiter.wang'), fileId),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('makes an unlinked file unreachable by content id', async () => {
    const uploadId = await insertUploadedFile('orphan.pdf');
    await expect(
      context.service.assertFileContentAccess(actor('hr.manager'), uploadId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('removes a linked file and rejects reusing another candidate’s file', async () => {
    const candidates = await context.service.listCandidates(
      actor('recruiter.li'),
    );
    const candidateId = candidates[0]!.id;
    const otherCandidateId = candidates[1]!.id;
    const fileId = await insertUploadedFile('resume.pdf');
    await context.service.attachCandidateFiles(
      actor('recruiter.li'),
      candidateId,
      {
        category: 'resume',
        fileIds: [fileId],
      },
    );
    await expect(
      context.service.attachCandidateFiles(
        actor('recruiter.li'),
        otherCandidateId,
        {
          category: 'resume',
          fileIds: [fileId],
        },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await context.service.removeCandidateFile(
      actor('recruiter.li'),
      candidateId,
      fileId,
    );
    await expect(
      context.service.assertFileContentAccess(actor('recruiter.li'), fileId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const detail = await context.service.getCandidate(
      actor('recruiter.li'),
      candidateId,
    );
    expect(detail.files).toHaveLength(0);
  });

  it('validates the attach payload before writing anything', async () => {
    const candidateId = await ownedCandidateId('recruiter.li');
    await expect(
      context.service.attachCandidateFiles(actor('recruiter.li'), candidateId, {
        category: 'unknown',
        fileIds: ['x'],
      }),
    ).rejects.toBeInstanceOf(RecruitmentError);
    await expect(
      context.service.attachCandidateFiles(actor('recruiter.li'), candidateId, {
        category: 'resume',
        fileIds: [],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      context.service.attachCandidateFiles(actor('recruiter.li'), candidateId, {
        category: 'resume',
        fileIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      context.service.attachCandidateFiles(actor('recruiter.li'), candidateId, {
        category: 'resume',
        fileIds: ['missing-file-id'],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('rejects an empty or oversized uploaded file when it is linked', async () => {
    const candidateId = await ownedCandidateId('recruiter.li');
    const empty = await insertUploadedFile(
      'empty.pdf',
      'pdf',
      'application/pdf',
      0,
    );
    await expect(
      context.service.attachCandidateFiles(actor('recruiter.li'), candidateId, {
        category: 'resume',
        fileIds: [empty],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    const oversized = await insertUploadedFile(
      'large.pdf',
      'pdf',
      'application/pdf',
      6 * 1024 * 1024,
    );
    await expect(
      context.service.attachCandidateFiles(actor('recruiter.li'), candidateId, {
        category: 'resume',
        fileIds: [oversized],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('serves attach and remove over HTTP with the caller’s identity', async () => {
    const router = createRecruitmentRoutes({
      service: context.service,
      auth: fakeAuth(),
    });
    const candidateId = await ownedCandidateId('recruiter.li');
    const fileId = await insertUploadedFile('resume.pdf');

    const attach = await router.request(`/candidates/${candidateId}/files`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': 'recruiter.li',
      },
      body: JSON.stringify({ category: 'resume', fileIds: [fileId] }),
    });
    expect(attach.status).toBe(200);

    const attachAsInterviewer = await router.request(
      `/candidates/${candidateId}/files`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-user': 'interviewer.zhang',
        },
        body: JSON.stringify({ category: 'portfolio', fileIds: [fileId] }),
      },
    );
    expect(attachAsInterviewer.status).toBe(403);

    const anonymous = await router.request(`/candidates/${candidateId}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'resume', fileIds: [fileId] }),
    });
    expect(anonymous.status).toBe(401);

    const remove = await router.request(
      `/candidates/${candidateId}/files/${fileId}`,
      { method: 'DELETE', headers: { 'x-test-user': 'recruiter.li' } },
    );
    expect(remove.status).toBe(200);
    await expect(remove.json()).resolves.toMatchObject({
      data: { id: fileId },
    });
  });

  function fakeAuth() {
    const required = (): MiddlewareHandler<AuthEnv> => {
      return async (nextContext: Context<AuthEnv>, next: Next) => {
        const username = nextContext.req.header('x-test-user');
        const userId = username
          ? context.actorByUsername[username]?.userId
          : undefined;
        if (!userId) {
          return nextContext.json({ code: 'UNAUTHENTICATED' }, 401);
        }
        nextContext.set('auth', {
          user: { id: userId },
          session: {},
        } as unknown as AuthEnv['Variables']['auth']);
        await next();
      };
    };
    return { required } as unknown as Pick<Auth, 'required'>;
  }
});
