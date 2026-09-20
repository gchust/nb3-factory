// @vitest-environment node
import type { Auth, AuthEnv } from '@nocobase/app-plugin-authentication';
import type { Context, MiddlewareHandler, Next } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRecruitmentRoutes } from '../../server/routes/recruitment.js';
import type { Actor } from '../../server/providers/recruitment.js';
import { createRecruitmentTestContext } from '../fixtures/recruitment-harness.js';

/**
 * Cancelling an interview must revoke exactly the cancelled interviewer's
 * access, keep the history that references the old resume version, and refuse
 * to delete a file an interview recorded.
 */
describe('recruitment interview cancellation', () => {
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
        size: 2048,
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

  /**
   * A candidate with no pre-existing assignment, so the test controls every
   * interview the interviewer can see.
   */
  async function freshCandidateId(): Promise<string> {
    const positions = await context.service.listPositions(actor('hr.manager'));
    const position = positions[0];
    if (!position) throw new Error('No position for the seed');
    const candidate = await context.service.createCandidate(
      actor('recruiter.li'),
      {
        name: `取消测试候选人 ${crypto.randomUUID().slice(0, 8)}`,
        positionId: position.id,
      },
    );
    return candidate.id;
  }

  async function attach(
    candidateId: string,
    category: 'resume' | 'portfolio' | 'offer',
    fileId: string,
  ): Promise<void> {
    await context.service.attachCandidateFiles(
      actor('recruiter.li'),
      candidateId,
      {
        category,
        fileIds: [fileId],
      },
    );
  }

  it('revokes the cancelled interviewer’s access while another interviewer keeps theirs', async () => {
    const candidateId = await freshCandidateId();
    const resume = await insertUploadedFile('resume.pdf');
    const portfolio = await insertUploadedFile('work.png', 'png', 'image/png');
    await attach(candidateId, 'resume', resume);
    await attach(candidateId, 'portfolio', portfolio);

    const cancelledInterview = await context.service.createInterview(
      actor('recruiter.li'),
      {
        candidateId,
        interviewerUsername: 'interviewer.zhang',
        scheduledAt: '2026-10-05T02:00:00.000Z',
      },
    );
    const keptInterview = await context.service.createInterview(
      actor('recruiter.li'),
      {
        candidateId,
        interviewerUsername: 'interviewer.chen',
        scheduledAt: '2026-10-06T02:00:00.000Z',
      },
    );

    // Both interviewers can reach the preparation material before cancelling.
    for (const username of ['interviewer.zhang', 'interviewer.chen']) {
      await expect(
        context.service.assertFileContentAccess(actor(username), resume),
      ).resolves.toBeUndefined();
      await expect(
        context.service.assertFileContentAccess(actor(username), portfolio),
      ).resolves.toBeUndefined();
    }

    const cancelled = await context.service.cancelInterview(
      actor('recruiter.li'),
      cancelledInterview.id,
    );
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledBy).toBe('recruiter.li');
    expect(cancelled.cancelledAt).not.toBeNull();

    // The cancelled interviewer loses resume, portfolio and candidate access.
    await expect(
      context.service.assertFileContentAccess(
        actor('interviewer.zhang'),
        resume,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    await expect(
      context.service.assertFileContentAccess(
        actor('interviewer.zhang'),
        portfolio,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      context.service.getCandidate(actor('interviewer.zhang'), candidateId),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      context.service.listCandidateFiles(
        actor('interviewer.zhang'),
        candidateId,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // The other interviewer is untouched and still reaches the same files.
    await expect(
      context.service.assertFileContentAccess(
        actor('interviewer.chen'),
        resume,
      ),
    ).resolves.toBeUndefined();
    await expect(
      context.service.assertFileContentAccess(
        actor('interviewer.chen'),
        portfolio,
      ),
    ).resolves.toBeUndefined();
    const chenDetail = await context.service.getCandidate(
      actor('interviewer.chen'),
      candidateId,
    );
    expect(chenDetail.files.some((file) => file.id === resume)).toBe(true);

    // The cancelled interview disappears from the cancelled interviewer's
    // calendar; the kept one remains.
    const zhangInterviews = await context.service.listInterviews(
      actor('interviewer.zhang'),
    );
    expect(
      zhangInterviews.some((row) => row.id === cancelledInterview.id),
    ).toBe(false);
    const chenInterviews = await context.service.listInterviews(
      actor('interviewer.chen'),
    );
    expect(chenInterviews.some((row) => row.id === keptInterview.id)).toBe(
      true,
    );

    // HR and the owning recruiter still see the cancelled row for the record.
    const hrInterviews = await context.service.listInterviews(
      actor('hr.manager'),
    );
    expect(
      hrInterviews.find((row) => row.id === cancelledInterview.id)?.status,
    ).toBe('cancelled');
  });

  it('keeps cancellation idempotent and refuses to cancel a completed interview', async () => {
    const candidateId = await ownedCandidateId('recruiter.li');
    const interview = await context.service.createInterview(
      actor('recruiter.li'),
      {
        candidateId,
        interviewerUsername: 'interviewer.zhang',
        scheduledAt: '2026-10-07T02:00:00.000Z',
      },
    );

    const first = await context.service.cancelInterview(
      actor('recruiter.li'),
      interview.id,
    );
    const second = await context.service.cancelInterview(
      actor('recruiter.li'),
      interview.id,
    );
    expect(second.id).toBe(first.id);
    expect(second.status).toBe('cancelled');

    // A cancelled interview cannot be moved or evaluated.
    await expect(
      context.service.updateInterview(actor('recruiter.li'), interview.id, {
        scheduledAt: '2026-10-08T02:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'INTERVIEW_NOT_CANCELLABLE' });
    await expect(
      context.service.completeInterview(actor('hr.manager'), interview.id, {
        result: 'pass',
      }),
    ).rejects.toMatchObject({ code: 'INTERVIEW_NOT_CANCELLABLE' });

    // Re-scheduling the same slot after cancelling creates a fresh interview,
    // so a repeated operation never accumulates onto the cancelled row.
    const rescheduled = await context.service.createInterview(
      actor('recruiter.li'),
      {
        candidateId,
        interviewerUsername: 'interviewer.zhang',
        scheduledAt: '2026-10-07T02:00:00.000Z',
      },
    );
    expect(rescheduled.id).not.toBe(interview.id);
    expect(rescheduled.status).toBe('scheduled');

    // A completed interview is not cancellable, and roles are enforced.
    const completed = await context.service.completeInterview(
      actor('interviewer.zhang'),
      rescheduled.id,
      { result: 'pass', score: 80 },
    );
    expect(completed.status).toBe('completed');
    await expect(
      context.service.cancelInterview(actor('recruiter.li'), rescheduled.id),
    ).rejects.toMatchObject({ code: 'INTERVIEW_NOT_CANCELLABLE' });

    const other = await context.service.createInterview(actor('recruiter.li'), {
      candidateId,
      interviewerUsername: 'interviewer.chen',
      scheduledAt: '2026-10-09T02:00:00.000Z',
    });
    await expect(
      context.service.cancelInterview(actor('recruiter.wang'), other.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      context.service.cancelInterview(actor('interviewer.chen'), other.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('keeps both resume versions, snapshots each interview’s version, and protects referenced files', async () => {
    const candidateId = await ownedCandidateId('recruiter.li');
    const v1 = await insertUploadedFile('resume-v1.pdf');
    await attach(candidateId, 'resume', v1);

    const first = await context.service.createInterview(actor('recruiter.li'), {
      candidateId,
      interviewerUsername: 'interviewer.zhang',
      scheduledAt: '2026-10-11T02:00:00.000Z',
    });
    expect(first.resumeFileId).toBe(v1);
    expect(first.resumeVersion).toBe(1);

    const v2 = await insertUploadedFile('resume-v2.pdf');
    await attach(candidateId, 'resume', v2);
    const second = await context.service.createInterview(
      actor('recruiter.li'),
      {
        candidateId,
        interviewerUsername: 'interviewer.chen',
        scheduledAt: '2026-10-12T02:00:00.000Z',
      },
    );
    expect(second.resumeFileId).toBe(v2);
    expect(second.resumeVersion).toBe(2);

    // Both versions remain listed, so the old interview can still open v1.
    const detail = await context.service.getCandidate(
      actor('recruiter.li'),
      candidateId,
    );
    const resumeIds = detail.files
      .filter((file) => file.category === 'resume')
      .map((file) => file.id);
    expect(resumeIds).toEqual(expect.arrayContaining([v1, v2]));
    const storedFirst = await context.service.listInterviews(
      actor('hr.manager'),
    );
    expect(storedFirst.find((row) => row.id === first.id)?.resumeFileId).toBe(
      v1,
    );
    expect(storedFirst.find((row) => row.id === second.id)?.resumeFileId).toBe(
      v2,
    );

    // Files an interview references cannot be removed; an unreferenced version can.
    await expect(
      context.service.removeCandidateFile(
        actor('recruiter.li'),
        candidateId,
        v1,
      ),
    ).rejects.toMatchObject({ code: 'FILE_IN_USE', status: 409 });
    await expect(
      context.service.removeCandidateFile(
        actor('recruiter.li'),
        candidateId,
        v2,
      ),
    ).rejects.toMatchObject({ code: 'FILE_IN_USE' });

    const v3 = await insertUploadedFile('resume-v3.pdf');
    await attach(candidateId, 'resume', v3);
    await expect(
      context.service.removeCandidateFile(
        actor('recruiter.li'),
        candidateId,
        v3,
      ),
    ).resolves.toBeUndefined();

    // Cancelling does not make a referenced file deletable: the transcript
    // still points at it.
    await context.service.cancelInterview(actor('recruiter.li'), first.id);
    await expect(
      context.service.removeCandidateFile(
        actor('recruiter.li'),
        candidateId,
        v1,
      ),
    ).rejects.toMatchObject({ code: 'FILE_IN_USE' });
  });

  it('exposes cancel over HTTP with authentication and ownership enforced', async () => {
    const router = createRecruitmentRoutes({
      service: context.service,
      auth: fakeAuth(),
    });
    const candidateId = await ownedCandidateId('recruiter.li');
    const interview = await context.service.createInterview(
      actor('recruiter.li'),
      {
        candidateId,
        interviewerUsername: 'interviewer.zhang',
        scheduledAt: '2026-10-15T02:00:00.000Z',
      },
    );

    const anonymous = await router.request(
      `/interviews/${interview.id}/cancel`,
      { method: 'POST' },
    );
    expect(anonymous.status).toBe(401);

    const asInterviewer = await router.request(
      `/interviews/${interview.id}/cancel`,
      { method: 'POST', headers: { 'x-test-user': 'interviewer.zhang' } },
    );
    expect(asInterviewer.status).toBe(403);

    const asOtherRecruiter = await router.request(
      `/interviews/${interview.id}/cancel`,
      { method: 'POST', headers: { 'x-test-user': 'recruiter.wang' } },
    );
    expect(asOtherRecruiter.status).toBe(403);

    const cancelled = await router.request(
      `/interviews/${interview.id}/cancel`,
      {
        method: 'POST',
        headers: { 'x-test-user': 'recruiter.li' },
      },
    );
    expect(cancelled.status).toBe(200);
    await expect(cancelled.json()).resolves.toMatchObject({
      data: { id: interview.id, status: 'cancelled' },
    });
  });

  it('drops cancelled interviews from the pipeline statistics', async () => {
    const candidateId = await ownedCandidateId('recruiter.li');
    const interview = await context.service.createInterview(
      actor('recruiter.li'),
      {
        candidateId,
        interviewerUsername: 'interviewer.zhang',
        scheduledAt: '2026-10-20T02:00:00.000Z',
      },
    );

    const before = await context.service.stats(actor('recruiter.li'));
    await context.service.cancelInterview(actor('recruiter.li'), interview.id);
    const after = await context.service.stats(actor('recruiter.li'));

    expect(after.interviews.total).toBe(before.interviews.total - 1);
    expect(after.interviews.scheduled).toBe(before.interviews.scheduled - 1);
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
