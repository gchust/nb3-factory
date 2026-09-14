import type {
  DatabaseAuthorizationConditions,
  DatabaseFilter,
} from '@nocobase/app-plugin-authorization';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  RecruitingError,
  RecruitingService,
} from '../../server/providers/recruiting-service.js';

import {
  createRecruitingTestDatabase,
  type RecruitingTestDatabase,
} from './recruiting-test-database.js';

function conditions(
  filter: DatabaseFilter = { $and: [] },
): DatabaseAuthorizationConditions {
  return {
    type: 'database',
    collection: 'main.recruitingRequisitions',
    action: 'read',
    filter,
    fields: { input: '*', output: '*' },
  };
}

describe('RecruitingService', () => {
  let database: RecruitingTestDatabase;
  let service: RecruitingService;

  beforeEach(async () => {
    database = await createRecruitingTestDatabase();
    service = new RecruitingService(database.database);
  });

  afterEach(async () => {
    await database.teardown();
  });

  async function createRequisition(
    overrides: Record<string, unknown> = {},
  ): Promise<number> {
    return service.createRequisition(
      {
        title: 'Backend engineer',
        department: 'Engineering',
        headcount: 2,
        priority: 'high',
        status: 'open',
        ...overrides,
      },
      conditions(),
    );
  }

  async function createCandidate(
    requisitionId: number,
    overrides: Record<string, unknown> = {},
  ): Promise<number> {
    return service.createCandidate(
      {
        name: 'Alice',
        email: 'alice@example.com',
        requisitionId,
        source: 'referral',
        stage: 'screening',
        ...overrides,
      },
      conditions(),
    );
  }

  it('filters the requisition list by an authorization condition', async () => {
    await createRequisition({ title: 'Open role', status: 'open' });
    await createRequisition({ title: 'Paused role', status: 'paused' });

    const filtered = await service.listRequisitions(
      conditions({ $and: [{ status: { $eq: 'open' } }] }),
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.title).toBe('Open role');
  });

  it('applies extra filters and rejects invalid enum values', async () => {
    await createRequisition({ title: 'Open role', status: 'open' });
    await createRequisition({ title: 'Paused role', status: 'paused' });

    const byStatus = await service.listRequisitions(conditions(), {
      status: 'paused',
    });
    expect(byStatus).toHaveLength(1);
    expect(byStatus[0]?.title).toBe('Paused role');

    await expect(createRequisition({ status: 'unknown' })).rejects.toThrow(
      RecruitingError,
    );
  });

  it('rejects unauthorized input fields', async () => {
    await expect(
      service.createRequisition(
        {
          title: 'x',
          department: 'y',
          headcount: 1,
          priority: 'low',
          status: 'open',
        },
        { ...conditions(), fields: { input: ['title'], output: '*' } },
      ),
    ).rejects.toThrow(/not authorized/);
  });

  it('moves the candidate to interviewing when an interview is scheduled', async () => {
    const requisitionId = await createRequisition();
    const candidateId = await createCandidate(requisitionId);

    const interviewId = await service.createInterview(
      {
        candidateId,
        round: 'initial',
        scheduledAt: new Date('2026-10-01T06:00:00.000Z').toISOString(),
        interviewerId: 'user-1',
        status: 'scheduled',
      },
      conditions(),
    );
    expect(interviewId).toBeGreaterThan(0);

    const candidate = await service.getCandidate(candidateId, conditions());
    expect(candidate?.stage).toBe('interviewing');

    const interviews = await service.listInterviews(conditions(), {
      candidateId,
    });
    expect(interviews).toHaveLength(1);
    expect(interviews[0]?.round).toBe('initial');
    expect(interviews[0]?.interviewerName).toBeNull();
    expect(interviews[0]?.evaluation).toBeNull();
  });

  it('computes the candidate overall score as the average of both ratings', async () => {
    const requisitionId = await createRequisition();
    const candidateId = await createCandidate(requisitionId);
    const interviewId = await service.createInterview(
      {
        candidateId,
        round: 'initial',
        scheduledAt: new Date('2026-10-01T06:00:00.000Z').toISOString(),
        interviewerId: 'user-1',
        status: 'scheduled',
      },
      conditions(),
    );

    const result = await service.submitEvaluation(
      interviewId,
      {
        technicalScore: 4,
        communicationScore: 5,
        conclusion: 'pass',
        comments: 'Strong',
      },
      'user-1',
    );
    expect(result.overallScore).toBe(4.5);

    let candidate = await service.getCandidate(candidateId, conditions());
    expect(Number(candidate?.overallScore)).toBe(4.5);

    // Submitting again updates the same evaluation rather than creating a second one.
    const updated = await service.submitEvaluation(
      interviewId,
      { technicalScore: 2, communicationScore: 4, conclusion: 'pending' },
      'user-1',
    );
    expect(updated.id).toBe(result.id);
    expect(updated.overallScore).toBe(3);

    candidate = await service.getCandidate(candidateId, conditions());
    expect(Number(candidate?.overallScore)).toBe(3);
  });

  it('rejects a score outside 1-5', async () => {
    const requisitionId = await createRequisition();
    const candidateId = await createCandidate(requisitionId);
    const interviewId = await service.createInterview(
      {
        candidateId,
        round: 'initial',
        scheduledAt: new Date('2026-10-01T06:00:00.000Z').toISOString(),
        status: 'scheduled',
      },
      conditions(),
    );

    await expect(
      service.submitEvaluation(
        interviewId,
        { technicalScore: 9, communicationScore: 3, conclusion: 'pass' },
        'user-1',
      ),
    ).rejects.toThrow(/between 1 and 5/);
  });

  it('allows only one offer per candidate', async () => {
    const requisitionId = await createRequisition();
    const candidateId = await createCandidate(requisitionId);

    const offerId = await service.createOffer(
      { candidateId, position: 'Backend engineer', status: 'pending' },
      conditions(),
    );
    expect(offerId).toBeGreaterThan(0);

    await expect(
      service.createOffer(
        { candidateId, position: 'Backend engineer', status: 'pending' },
        conditions(),
      ),
    ).rejects.toMatchObject({ code: 'OFFER_ALREADY_EXISTS', status: 409 });

    const offers = await service.listOffers(conditions(), { candidateId });
    expect(offers).toHaveLength(1);
  });

  it('counts interview statuses for the dashboard', async () => {
    const requisitionId = await createRequisition();
    const candidateId = await createCandidate(requisitionId);
    await service.createInterview(
      {
        candidateId,
        round: 'initial',
        scheduledAt: new Date('2026-10-01T06:00:00.000Z').toISOString(),
        status: 'scheduled',
      },
      conditions(),
    );

    const counts = await service.interviewStatusCounts(conditions());
    expect(counts.get('scheduled')).toBe(1);
  });
});
