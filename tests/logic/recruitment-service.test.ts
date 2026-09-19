// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RecruitmentError } from '../../server/providers/recruitment.js';
import { createRecruitmentTestContext } from '../fixtures/recruitment-harness.js';

describe('recruitment service', () => {
  let context: Awaited<ReturnType<typeof createRecruitmentTestContext>>;

  beforeEach(async () => {
    context = await createRecruitmentTestContext();
  });

  afterEach(async () => {
    await context.destroy();
  });

  const hr = () => context.actorByUsername['hr.manager'];
  const li = () => context.actorByUsername['recruiter.li'];
  const wang = () => context.actorByUsername['recruiter.wang'];
  const zhang = () => context.actorByUsername['interviewer.zhang'];

  async function candidateByName(name: string) {
    const rows = await context.service.listCandidates(hr());
    const row = rows.find((candidate) => candidate.name === name);
    if (!row) throw new Error(`Missing demo candidate: ${name}`);
    return row;
  }

  it('filters interviews by date range without losing scoping', async () => {
    const september = {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.000Z',
    };
    const all = await context.service.listInterviews(hr(), september);
    expect(all).toHaveLength(8);

    // Bounds exclude the two earliest interviews and nothing else.
    const later = await context.service.listInterviews(hr(), {
      from: '2026-09-09T00:00:00.000Z',
      to: '2026-09-30T23:59:59.000Z',
    });
    expect(later.map((interview) => interview.candidateName).sort()).toEqual(
      ['周敏', '孙丽', '李强', '冯涛', '褚磊', '郑爽'].sort(),
    );

    // A month with no interviews returns an empty list, not everything.
    await expect(
      context.service.listInterviews(hr(), {
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T23:59:59.000Z',
      }),
    ).resolves.toEqual([]);

    // An interviewer's range still only contains their own interviews.
    const zhangRange = await context.service.listInterviews(zhang(), september);
    expect(zhangRange).toHaveLength(4);
    expect(
      zhangRange.every(
        (interview) => interview.interviewerUsername === 'interviewer.zhang',
      ),
    ).toBe(true);
  });

  it('resolves roles and scopes candidate and interview visibility', async () => {
    expect(hr().role).toBe('hr');
    expect(li().role).toBe('recruiter');
    expect(zhang().role).toBe('interviewer');

    const all = await context.service.listCandidates(hr());
    expect(all).toHaveLength(12);
    expect(all.every((candidate) => candidate.phone)).toBe(true);

    const own = await context.service.listCandidates(li());
    expect(own).toHaveLength(6);
    expect(
      own.every((candidate) => candidate.recruiterUsername === 'recruiter.li'),
    ).toBe(true);

    const interviewed = await context.service.listCandidates(zhang());
    expect(interviewed.map((candidate) => candidate.name).sort()).toEqual(
      ['周敏', '孙丽', '冯涛', '赵敏'].sort(),
    );
    // Interviewers never receive contact details or notes.
    expect(interviewed.every((candidate) => candidate.phone === null)).toBe(
      true,
    );

    const interviews = await context.service.listInterviews(zhang());
    expect(interviews).toHaveLength(4);
    expect(
      interviews.every(
        (interview) => interview.interviewerUsername === 'interviewer.zhang',
      ),
    ).toBe(true);

    // An interviewer may open a candidate they interview, but only with the
    // limited view and their own interviews.
    const assignedDetail = await context.service.getCandidate(
      zhang(),
      interviewed[0].id,
    );
    expect(assignedDetail.candidate.phone).toBeNull();
    expect(assignedDetail.candidate.email).toBeNull();
    expect(assignedDetail.onboarding).toEqual([]);
    expect(
      assignedDetail.interviews.every(
        (interview) => interview.interviewerUsername === 'interviewer.zhang',
      ),
    ).toBe(true);

    const outsider = await context.service.resolveActor(context.plainUserId);
    expect(outsider.role).toBe('none');
    await expect(
      context.service.listCandidates(outsider),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });

  it('denies cross-recruiter, interviewer and stats access', async () => {
    const wangCandidate = (await context.service.listCandidates(wang()))[0];
    await expect(
      context.service.getCandidate(li(), wangCandidate.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });

    const untouched = await candidateByName('钱伟');
    await expect(
      context.service.getCandidate(zhang(), untouched.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });

    await expect(context.service.stats(zhang())).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
    await expect(context.service.listStaff(zhang())).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });

  it('lets only the HR manager confirm a hire, creating onboarding tasks once', async () => {
    const sunli = await candidateByName('孙丽');
    expect(sunli.stage).toBe('pending_offer');

    await expect(
      context.service.changeStage(li(), sunli.id, { stage: 'offered' }),
    ).rejects.toMatchObject({ code: 'HIRE_REQUIRES_HR', status: 403 });

    const offered = await context.service.changeStage(hr(), sunli.id, {
      stage: 'offered',
    });
    expect(offered.stage).toBe('offered');
    expect(offered.hireConfirmedBy).toBe('hr.manager');
    expect(offered.offeredAt).not.toBeNull();

    const detail = await context.service.getCandidate(hr(), sunli.id);
    expect(detail.onboarding).toHaveLength(4);
    expect(detail.onboarding.every((todo) => todo.status === 'pending')).toBe(
      true,
    );

    // Confirming the same hire again does not duplicate onboarding work.
    const again = await context.service.changeStage(hr(), sunli.id, {
      stage: 'offered',
    });
    expect(again.stage).toBe('offered');
    const afterRepeat = await context.service.getCandidate(hr(), sunli.id);
    expect(afterRepeat.onboarding).toHaveLength(4);

    const onboarded = await context.service.changeStage(hr(), sunli.id, {
      stage: 'onboarded',
    });
    expect(onboarded.stage).toBe('onboarded');
    expect(onboarded.onboardedAt).not.toBeNull();

    // Onboarded is terminal.
    await expect(
      context.service.changeStage(hr(), sunli.id, { stage: 'offered' }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });
  });

  it('rejects invalid transitions and lets only HR reopen a rejected candidate', async () => {
    const zhaomin = await candidateByName('赵敏');
    expect(zhaomin.stage).toBe('onboarded');
    await expect(
      context.service.changeStage(hr(), zhaomin.id, { stage: 'offered' }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });

    const wulei = await candidateByName('吴磊');
    expect(wulei.stage).toBe('rejected');
    // 吴磊 belongs to recruiter.wang; recruiter.li cannot touch it at all.
    await expect(
      context.service.changeStage(li(), wulei.id, { stage: 'rejected' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });

    await expect(
      context.service.changeStage(wang(), wulei.id, { stage: 'pending' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });

    const reopened = await context.service.changeStage(hr(), wulei.id, {
      stage: 'pending',
    });
    expect(reopened.stage).toBe('pending');
  });

  it('records an interview evaluation once and advances the candidate once', async () => {
    const zhoumin = await candidateByName('周敏');
    expect(zhoumin.stage).toBe('pending');
    const scheduled = (await context.service.listInterviews(zhang())).find(
      (interview) => interview.candidateId === zhoumin.id,
    );
    expect(scheduled).toBeDefined();

    const completed = await context.service.completeInterview(
      zhang(),
      scheduled!.id,
      { score: 91, result: 'pass', evaluation: '表现优秀' },
    );
    expect(completed.status).toBe('completed');
    expect(completed.score).toBe(91);

    const afterFirst = await candidateByName('周敏');
    expect(afterFirst.stage).toBe('interviewed');

    const repeated = await context.service.completeInterview(
      zhang(),
      scheduled!.id,
      { score: 91, result: 'pass', evaluation: '表现优秀' },
    );
    expect(repeated.status).toBe('completed');
    const afterSecond = await candidateByName('周敏');
    expect(afterSecond.stage).toBe('interviewed');
    const all = await context.service.listInterviews(hr(), {
      candidateId: zhoumin.id,
    });
    expect(all).toHaveLength(1);

    // A recruiter may not record an evaluation, and an interviewer may not
    // drive the candidate's stage.
    const sunli = await candidateByName('孙丽');
    const sunliInterview = (
      await context.service.listInterviews(hr(), {
        candidateId: sunli.id,
      })
    )[0];
    await expect(
      context.service.completeInterview(li(), sunliInterview.id, {
        score: 50,
        result: 'pass',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    await expect(
      context.service.changeStage(zhang(), zhoumin.id, {
        stage: 'pending_offer',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('keeps schedule creation and onboarding toggles repeatable', async () => {
    const position = (await context.service.listPositions(li()))[0];
    const chenjing = await context.service.createCandidate(li(), {
      name: '测试候选人',
      positionId: position.id,
      phone: '13900000001',
    });
    const scheduledAt = '2026-10-01T02:00:00.000Z';
    const first = await context.service.createInterview(li(), {
      candidateId: chenjing.id,
      interviewerUsername: 'interviewer.chen',
      scheduledAt,
      method: 'video',
    });
    const second = await context.service.createInterview(li(), {
      candidateId: chenjing.id,
      interviewerUsername: 'interviewer.chen',
      scheduledAt,
      method: 'video',
    });
    expect(second.id).toBe(first.id);
    const list = await context.service.listInterviews(hr(), {
      candidateId: chenjing.id,
    });
    expect(list).toHaveLength(1);

    // A recruiter cannot schedule for someone else's candidate.
    await expect(
      context.service.createInterview(li(), {
        candidateId: (await candidateByName('钱伟')).id,
        interviewerUsername: 'interviewer.chen',
        scheduledAt,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });

    const zhaomin = await candidateByName('赵敏');
    const detail = await context.service.getCandidate(hr(), zhaomin.id);
    const todo = detail.onboarding[0];
    const done = await context.service.setOnboardingStatus(hr(), todo.id, {
      status: 'done',
    });
    const doneAgain = await context.service.setOnboardingStatus(hr(), todo.id, {
      status: 'done',
    });
    expect(done.status).toBe('done');
    expect(doneAgain.status).toBe('done');
    const after = await context.service.getCandidate(hr(), zhaomin.id);
    expect(after.onboarding).toHaveLength(detail.onboarding.length);
  });

  it('scopes statistics to the caller and fails closed for unknown input', async () => {
    const hrStats = await context.service.stats(hr());
    expect(hrStats.positions.total).toBe(4);
    expect(hrStats.candidates.total).toBe(12);
    expect(hrStats.candidates.byStage.onboarded).toBe(1);

    const recruiterStats = await context.service.stats(li());
    expect(recruiterStats.candidates.total).toBe(6);
    expect(
      Object.values(recruiterStats.candidates.byStage).reduce(
        (sum, value) => sum + value,
        0,
      ),
    ).toBe(6);

    const error = await context.service
      .createPosition(li(), {
        title: '违规岗位',
        department: '研发部',
        headcount: 1,
      })
      .then(
        () => undefined,
        (cause: unknown) => cause as RecruitmentError,
      );
    expect(error?.code).toBe('FORBIDDEN');

    await expect(
      context.service.createCandidate(hr(), {
        name: '非法候选人',
        positionId: 'missing-position',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION', status: 400 });
  });
});
