import {
  defineSeed,
  type QueryAdapter,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Sample recruiting data so a fresh installation has something to look at: two open requisitions, three
 * candidates in different stages, one scheduled interview with a submitted evaluation.
 *
 * Idempotent: every row is looked up by a stable natural key before inserting, so re-running the seed changes
 * nothing. Offers are deliberately not seeded so the one-offer-per-candidate rule is easy to exercise.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609100002_seed_recruiting_sample_data',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (
      !(await client.schema.hasTable('recruiting_requisitions')) ||
      !(await client.schema.hasTable('recruiting_candidates'))
    ) {
      return;
    }

    const now = new Date();

    const frontend = await upsertRequisition(query, now, {
      title: '高级前端工程师',
      department: '研发中心',
      headcount: 3,
      requirements:
        '5 年以上前端经验，精通 React 与 TypeScript，有复杂中后台系统经验优先。',
      expectedArrivalDate: '2026-11-01',
      priority: 'high',
      status: 'open',
    });
    const product = await upsertRequisition(query, now, {
      title: '产品经理',
      department: '产品部',
      headcount: 1,
      requirements: '3 年以上 B 端产品经验，熟悉招聘或人力资源业务优先。',
      expectedArrivalDate: '2026-12-01',
      priority: 'medium',
      status: 'open',
    });

    const zhangWei = await upsertCandidate(query, now, {
      name: '张伟',
      phone: '13800000001',
      email: 'zhang.wei@example.com',
      requisitionId: frontend,
      source: 'referral',
      stage: 'screening',
    });
    const liNa = await upsertCandidate(query, now, {
      name: '李娜',
      phone: '13800000002',
      email: 'li.na@example.com',
      requisitionId: frontend,
      source: 'job_board',
      stage: 'interviewing',
    });
    await upsertCandidate(query, now, {
      name: '王强',
      phone: '13800000003',
      email: 'wang.qiang@example.com',
      requisitionId: product,
      source: 'campus',
      stage: 'screening',
    });

    if (zhangWei === undefined || liNa === undefined) return;

    const admin = await query
      .selectFrom('user')
      .select(['id', 'name'])
      .where('username', '=', 'nocobase')
      .executeTakeFirst();
    const interviewerId = admin ? String(admin.id) : null;

    const interview = await upsertInterview(query, now, {
      candidateId: liNa,
      round: 'initial',
      scheduledAt: new Date('2026-10-01T06:00:00.000Z'),
      interviewerId,
      locationOrLink: '线上会议 / meet.example.com/recruiting',
      status: 'scheduled',
    });

    if (interview !== undefined) {
      await upsertEvaluation(query, now, {
        interviewId: interview,
        technicalScore: 4,
        communicationScore: 3,
        conclusion: 'pass',
        comments: '技术基础扎实，沟通表达清晰，建议进入复试。',
        createdById: interviewerId,
      });
    }
  },
});

interface RequisitionInput {
  title: string;
  department: string;
  headcount: number;
  requirements: string;
  expectedArrivalDate: string;
  priority: string;
  status: string;
}

async function upsertRequisition(
  query: QueryAdapter,
  now: Date,
  input: RequisitionInput,
): Promise<number | undefined> {
  const existing = await query
    .selectFrom('recruitingRequisitions')
    .select('id')
    .where('title', '=', input.title)
    .executeTakeFirst();
  if (existing) return Number(existing.id);

  await query
    .insertInto('recruitingRequisitions')
    .values({
      ...input,
      expectedArrivalDate: new Date(
        `${input.expectedArrivalDate}T00:00:00.000Z`,
      ),
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  const created = await query
    .selectFrom('recruitingRequisitions')
    .select('id')
    .where('title', '=', input.title)
    .executeTakeFirst();
  return created ? Number(created.id) : undefined;
}

interface CandidateInput {
  name: string;
  phone: string;
  email: string;
  requisitionId: number | undefined;
  source: string;
  stage: string;
}

async function upsertCandidate(
  query: QueryAdapter,
  now: Date,
  input: CandidateInput,
): Promise<number | undefined> {
  const existing = await query
    .selectFrom('recruitingCandidates')
    .select('id')
    .where('email', '=', input.email)
    .executeTakeFirst();
  if (existing) return Number(existing.id);

  await query
    .insertInto('recruitingCandidates')
    .values({
      ...input,
      overallScore: null,
      resumeFileId: null,
      resumeFilename: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  const created = await query
    .selectFrom('recruitingCandidates')
    .select('id')
    .where('email', '=', input.email)
    .executeTakeFirst();
  return created ? Number(created.id) : undefined;
}

interface InterviewInput {
  candidateId: number;
  round: string;
  scheduledAt: Date;
  interviewerId: string | null;
  locationOrLink: string;
  status: string;
}

async function upsertInterview(
  query: QueryAdapter,
  now: Date,
  input: InterviewInput,
): Promise<number | undefined> {
  const existing = await query
    .selectFrom('recruitingInterviews')
    .select('id')
    .where('candidateId', '=', input.candidateId)
    .where('round', '=', input.round)
    .executeTakeFirst();
  if (existing) return Number(existing.id);

  await query
    .insertInto('recruitingInterviews')
    .values({ ...input, createdAt: now, updatedAt: now })
    .execute();

  const created = await query
    .selectFrom('recruitingInterviews')
    .select('id')
    .where('candidateId', '=', input.candidateId)
    .where('round', '=', input.round)
    .executeTakeFirst();
  return created ? Number(created.id) : undefined;
}

interface EvaluationInput {
  interviewId: number;
  technicalScore: number;
  communicationScore: number;
  conclusion: string;
  comments: string;
  createdById: string | null;
}

async function upsertEvaluation(
  query: QueryAdapter,
  now: Date,
  input: EvaluationInput,
): Promise<void> {
  const existing = await query
    .selectFrom('recruitingEvaluations')
    .select('id')
    .where('interviewId', '=', input.interviewId)
    .executeTakeFirst();
  if (existing) return;

  await query
    .insertInto('recruitingEvaluations')
    .values({ ...input, createdAt: now, updatedAt: now })
    .execute();

  // Keep the candidate's computed average consistent with the seeded evaluation.
  const interview = await query
    .selectFrom('recruitingInterviews')
    .select('candidateId')
    .where('id', '=', input.interviewId)
    .executeTakeFirst();
  if (!interview) return;

  const average =
    Math.round(((input.technicalScore + input.communicationScore) / 2) * 100) /
    100;
  await query
    .updateTable('recruitingCandidates')
    .set({ overallScore: average, updatedAt: now })
    .where('id', '=', Number(interview.candidateId))
    .execute();
}

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;
