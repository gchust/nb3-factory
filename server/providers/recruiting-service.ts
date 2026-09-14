import type {
  DatabaseAuthorizationConditions,
  DatabaseFilter,
  DatabaseFilterOperator,
} from '@nocobase/app-plugin-authorization';
import type {
  ComparisonOperator,
  DatabaseManager,
  Expression,
  ExpressionBuilder,
  QueryAdapter,
  Row,
  SqlBool,
} from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

/**
 * Domain logic for the recruiting module.
 *
 * The routes own HTTP and authorization; this service owns the queries and the business rules (stage transitions,
 * computed candidate score, one-offer-per-candidate). Authorization conditions are passed in and compiled into the
 * same SQL statement as every other predicate, so an unauthorized record simply does not match.
 */

export const recruitingServiceToken: ServiceToken<RecruitingService> =
  createServiceToken<RecruitingService>('app/recruiting-service');

export const REQUISITION_FIELDS = [
  'id',
  'title',
  'department',
  'headcount',
  'requirements',
  'expectedArrivalDate',
  'priority',
  'status',
  'createdAt',
  'updatedAt',
] as const;

export const CANDIDATE_FIELDS = [
  'id',
  'name',
  'phone',
  'email',
  'requisitionId',
  'source',
  'stage',
  'overallScore',
  'resumeFileId',
  'resumeFilename',
  'createdAt',
  'updatedAt',
] as const;

export const INTERVIEW_FIELDS = [
  'id',
  'candidateId',
  'round',
  'scheduledAt',
  'interviewerId',
  'locationOrLink',
  'status',
  'createdAt',
  'updatedAt',
] as const;

export const EVALUATION_FIELDS = [
  'id',
  'interviewId',
  'technicalScore',
  'communicationScore',
  'conclusion',
  'comments',
  'createdById',
  'createdAt',
  'updatedAt',
] as const;

export const OFFER_FIELDS = [
  'id',
  'candidateId',
  'position',
  'salary',
  'expectedStartDate',
  'status',
  'createdAt',
  'updatedAt',
] as const;

export interface RequisitionInput {
  title?: string;
  department?: string;
  headcount?: number;
  requirements?: string | null;
  expectedArrivalDate?: string | null;
  priority?: string;
  status?: string;
}

export interface CandidateInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  requisitionId?: number | null;
  source?: string;
  stage?: string;
  resumeFileId?: string | null;
  resumeFilename?: string | null;
}

export interface InterviewInput {
  candidateId?: number;
  round?: string;
  scheduledAt?: string;
  interviewerId?: string | null;
  locationOrLink?: string | null;
  status?: string;
}

export interface EvaluationInput {
  technicalScore: number;
  communicationScore: number;
  conclusion: string;
  comments?: string | null;
}

export interface OfferInput {
  candidateId?: number;
  position?: string;
  salary?: number | null;
  expectedStartDate?: string | null;
  status?: string;
}

export class RecruitingError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = 'RecruitingError';
  }
}

export class RecruitingService {
  constructor(private readonly database: DatabaseManager) {}

  private get query(): QueryAdapter {
    return this.database.query();
  }

  // ----- Requisitions ------------------------------------------------------------------

  async listRequisitions(
    conditions: DatabaseAuthorizationConditions,
    filters: { status?: string; keyword?: string } = {},
  ): Promise<Row[]> {
    let builder = this.query
      .selectFrom('recruitingRequisitions')
      .select(selectColumns(conditions, REQUISITION_FIELDS))
      .where((eb) => compileFilter(eb, conditions.filter));
    if (filters.status) {
      builder = builder.where('status', '=', filters.status);
    }
    if (filters.keyword) {
      builder = builder.where('title', 'like', `%${filters.keyword}%`);
    }
    const rows = await builder.orderBy('createdAt', 'desc').execute();
    return rows.map(serializeRow);
  }

  async getRequisition(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row | undefined> {
    const row = await this.query
      .selectFrom('recruitingRequisitions')
      .select(selectColumns(conditions, REQUISITION_FIELDS))
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .executeTakeFirst();
    return row ? serializeRow(row) : undefined;
  }

  async createRequisition(
    input: RequisitionInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    assertInputFields(input, conditions.fields.input);
    const required = requireStrings(input, ['title', 'department']);
    const priority = requireEnum(input.priority, REQ_PRIORITIES, 'priority');
    const status = requireEnum(input.status, REQ_STATUSES, 'status');
    const headcount = requirePositiveInteger(input.headcount, 'headcount');
    const now = new Date();
    const result = await this.query
      .insertInto('recruitingRequisitions')
      .values({
        title: required.title,
        department: required.department,
        headcount,
        requirements: input.requirements ?? null,
        expectedArrivalDate: toDate(input.expectedArrivalDate),
        priority,
        status,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return insertId(result.insertId, 'recruitingRequisitions', this.query);
  }

  async updateRequisition(
    id: number,
    input: RequisitionInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    assertInputFields(input, conditions.fields.input);
    const values: Row = { updatedAt: new Date() };
    if (input.title !== undefined)
      values.title = requireNonEmpty(input.title, 'title');
    if (input.department !== undefined)
      values.department = requireNonEmpty(input.department, 'department');
    if (input.headcount !== undefined)
      values.headcount = requirePositiveInteger(input.headcount, 'headcount');
    if (input.requirements !== undefined)
      values.requirements = input.requirements;
    if (input.expectedArrivalDate !== undefined)
      values.expectedArrivalDate = toDate(input.expectedArrivalDate);
    if (input.priority !== undefined)
      values.priority = requireEnum(input.priority, REQ_PRIORITIES, 'priority');
    if (input.status !== undefined)
      values.status = requireEnum(input.status, REQ_STATUSES, 'status');

    const result = await this.query
      .updateTable('recruitingRequisitions')
      .set(values)
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    return result.updatedCount ?? 0;
  }

  async deleteRequisition(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    const result = await this.query
      .deleteFrom('recruitingRequisitions')
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    return result.deletedCount ?? 0;
  }

  /** Users who can be selected as an interviewer when scheduling. */
  async listInterviewers(): Promise<Row[]> {
    return this.query
      .selectFrom('user')
      .select(['id', 'name', 'email'])
      .orderBy('name', 'asc')
      .execute();
  }

  async requisitionOptions(
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row[]> {
    const rows = await this.query
      .selectFrom('recruitingRequisitions')
      .select(['id', 'title', 'department', 'status'])
      .where((eb) => compileFilter(eb, conditions.filter))
      .orderBy('createdAt', 'desc')
      .execute();
    return rows;
  }

  // ----- Candidates --------------------------------------------------------------------

  async listCandidates(
    conditions: DatabaseAuthorizationConditions,
    filters: { requisitionId?: number; stage?: string; keyword?: string } = {},
  ): Promise<Row[]> {
    let builder = this.query
      .selectFrom('recruitingCandidates')
      .select(selectColumns(conditions, CANDIDATE_FIELDS))
      .where((eb) => compileFilter(eb, conditions.filter));
    if (filters.requisitionId !== undefined) {
      builder = builder.where('requisitionId', '=', filters.requisitionId);
    }
    if (filters.stage) {
      builder = builder.where('stage', '=', filters.stage);
    }
    if (filters.keyword) {
      builder = builder.where('name', 'like', `%${filters.keyword}%`);
    }
    const rows = await builder.orderBy('createdAt', 'desc').execute();
    return this.decorateCandidates(rows);
  }

  async getCandidate(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row | undefined> {
    const row = await this.query
      .selectFrom('recruitingCandidates')
      .select(selectColumns(conditions, CANDIDATE_FIELDS))
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .executeTakeFirst();
    if (!row) return undefined;
    const [decorated] = await this.decorateCandidates([row]);
    return decorated;
  }

  async createCandidate(
    input: CandidateInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    assertInputFields(input, conditions.fields.input);
    const name = requireNonEmpty(input.name, 'name');
    const source = requireEnum(input.source, CANDIDATE_SOURCES, 'source');
    const stage = requireEnum(input.stage, CANDIDATE_STAGES, 'stage');
    const now = new Date();
    const result = await this.query
      .insertInto('recruitingCandidates')
      .values({
        name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        requisitionId: input.requisitionId ?? null,
        source,
        stage,
        overallScore: null,
        resumeFileId: input.resumeFileId ?? null,
        resumeFilename: input.resumeFilename ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return insertId(result.insertId, 'recruitingCandidates', this.query);
  }

  async updateCandidate(
    id: number,
    input: CandidateInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    assertInputFields(input, conditions.fields.input);
    const values: Row = { updatedAt: new Date() };
    if (input.name !== undefined)
      values.name = requireNonEmpty(input.name, 'name');
    if (input.phone !== undefined) values.phone = input.phone;
    if (input.email !== undefined) values.email = input.email;
    if (input.requisitionId !== undefined)
      values.requisitionId = input.requisitionId;
    if (input.source !== undefined)
      values.source = requireEnum(input.source, CANDIDATE_SOURCES, 'source');
    if (input.stage !== undefined)
      values.stage = requireEnum(input.stage, CANDIDATE_STAGES, 'stage');
    if (input.resumeFileId !== undefined)
      values.resumeFileId = input.resumeFileId;
    if (input.resumeFilename !== undefined)
      values.resumeFilename = input.resumeFilename;

    const result = await this.query
      .updateTable('recruitingCandidates')
      .set(values)
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    return result.updatedCount ?? 0;
  }

  async deleteCandidate(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    const result = await this.query
      .deleteFrom('recruitingCandidates')
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    return result.deletedCount ?? 0;
  }

  private async decorateCandidates(rows: Row[]): Promise<Row[]> {
    if (rows.length === 0) return rows;
    const requisitionIds = uniqueNumbers(
      rows.map((row) => row.requisitionId as number | null),
    );
    const titles = new Map<number, Row>();
    if (requisitionIds.length > 0) {
      const requisitions = await this.query
        .selectFrom('recruitingRequisitions')
        .select(['id', 'title', 'department'])
        .where('id', 'in', requisitionIds)
        .execute();
      for (const requisition of requisitions) {
        titles.set(Number(requisition.id), requisition);
      }
    }
    return rows.map((row) => {
      const requisition =
        row.requisitionId === null || row.requisitionId === undefined
          ? undefined
          : titles.get(Number(row.requisitionId));
      return serializeRow({
        ...row,
        requisitionTitle: requisition?.title ?? null,
        requisitionDepartment: requisition?.department ?? null,
      });
    });
  }

  // ----- Interviews --------------------------------------------------------------------

  async listInterviews(
    conditions: DatabaseAuthorizationConditions,
    filters: { candidateId?: number; status?: string } = {},
  ): Promise<Row[]> {
    let builder = this.query
      .selectFrom('recruitingInterviews')
      .select(selectColumns(conditions, INTERVIEW_FIELDS))
      .where((eb) => compileFilter(eb, conditions.filter));
    if (filters.candidateId !== undefined) {
      builder = builder.where('candidateId', '=', filters.candidateId);
    }
    if (filters.status) {
      builder = builder.where('status', '=', filters.status);
    }
    const rows = await builder.orderBy('scheduledAt', 'desc').execute();
    return this.decorateInterviews(rows);
  }

  async getInterview(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row | undefined> {
    const row = await this.query
      .selectFrom('recruitingInterviews')
      .select(selectColumns(conditions, INTERVIEW_FIELDS))
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .executeTakeFirst();
    if (!row) return undefined;
    const [decorated] = await this.decorateInterviews([row]);
    return decorated;
  }

  /**
   * Schedules an interview and moves the candidate to the "interviewing" stage in one transaction, so a scheduled
   * interview can never leave the candidate behind.
   */
  async createInterview(
    input: InterviewInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    assertInputFields(input, conditions.fields.input);
    const candidateId = requirePositiveInteger(
      input.candidateId,
      'candidateId',
    );
    const round = requireEnum(input.round, INTERVIEW_ROUNDS, 'round');
    const status = requireEnum(input.status, INTERVIEW_STATUSES, 'status');
    const scheduledAt = toDate(input.scheduledAt);
    if (!scheduledAt) {
      throw new RecruitingError(
        'INVALID_SCHEDULED_AT',
        'An interview needs a scheduled time.',
      );
    }

    return this.database.transaction(async (connection) => {
      const now = new Date();
      const result = await connection.query
        .insertInto('recruitingInterviews')
        .values({
          candidateId,
          round,
          scheduledAt,
          interviewerId: input.interviewerId ?? null,
          locationOrLink: input.locationOrLink ?? null,
          status,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const id = await insertId(
        result.insertId,
        'recruitingInterviews',
        connection.query,
      );

      // Scheduling an interview advances the candidate to "interviewing".
      await connection.query
        .updateTable('recruitingCandidates')
        .set({ stage: 'interviewing', updatedAt: now })
        .where('id', '=', candidateId)
        .execute();
      return id;
    });
  }

  async updateInterview(
    id: number,
    input: InterviewInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    assertInputFields(input, conditions.fields.input);
    const values: Row = { updatedAt: new Date() };
    if (input.round !== undefined)
      values.round = requireEnum(input.round, INTERVIEW_ROUNDS, 'round');
    if (input.scheduledAt !== undefined)
      values.scheduledAt = toDate(input.scheduledAt);
    if (input.interviewerId !== undefined)
      values.interviewerId = input.interviewerId;
    if (input.locationOrLink !== undefined)
      values.locationOrLink = input.locationOrLink;
    if (input.status !== undefined)
      values.status = requireEnum(input.status, INTERVIEW_STATUSES, 'status');

    const result = await this.query
      .updateTable('recruitingInterviews')
      .set(values)
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    return result.updatedCount ?? 0;
  }

  private async decorateInterviews(rows: Row[]): Promise<Row[]> {
    if (rows.length === 0) return rows;
    const candidateIds = uniqueNumbers(
      rows.map((row) => row.candidateId as number | null),
    );
    const interviewIds = uniqueNumbers(rows.map((row) => Number(row.id)));
    const interviewerIds = [
      ...new Set(
        rows
          .map((row) => row.interviewerId)
          .filter((value): value is string => typeof value === 'string'),
      ),
    ];

    const candidates = new Map<number, Row>();
    const requisitionIds: number[] = [];
    if (candidateIds.length > 0) {
      const candidateRows = await this.query
        .selectFrom('recruitingCandidates')
        .select(['id', 'name', 'stage', 'requisitionId'])
        .where('id', 'in', candidateIds)
        .execute();
      for (const candidate of candidateRows) {
        candidates.set(Number(candidate.id), candidate);
        if (candidate.requisitionId !== null) {
          requisitionIds.push(Number(candidate.requisitionId));
        }
      }
    }

    const requisitions = new Map<number, Row>();
    const uniqueRequisitionIds = [...new Set(requisitionIds)];
    if (uniqueRequisitionIds.length > 0) {
      const requisitionRows = await this.query
        .selectFrom('recruitingRequisitions')
        .select(['id', 'title'])
        .where('id', 'in', uniqueRequisitionIds)
        .execute();
      for (const requisition of requisitionRows) {
        requisitions.set(Number(requisition.id), requisition);
      }
    }

    const interviewers = new Map<string, Row>();
    if (interviewerIds.length > 0) {
      const userRows = await this.query
        .selectFrom('user')
        .select(['id', 'name'])
        .where('id', 'in', interviewerIds)
        .execute();
      for (const user of userRows) {
        interviewers.set(String(user.id), user);
      }
    }

    const evaluations = new Map<number, Row>();
    if (interviewIds.length > 0) {
      const evaluationRows = await this.query
        .selectFrom('recruitingEvaluations')
        .select(EVALUATION_FIELDS as unknown as readonly string[])
        .where('interviewId', 'in', interviewIds)
        .execute();
      for (const evaluation of evaluationRows) {
        evaluations.set(Number(evaluation.interviewId), evaluation);
      }
    }

    return rows.map((row) => {
      const candidate = candidates.get(Number(row.candidateId));
      const requisitionId = candidate?.requisitionId;
      const requisition =
        requisitionId === null || requisitionId === undefined
          ? undefined
          : requisitions.get(Number(requisitionId));
      const interviewer =
        typeof row.interviewerId === 'string'
          ? interviewers.get(row.interviewerId)
          : undefined;
      const evaluation = evaluations.get(Number(row.id));
      return serializeRow({
        ...row,
        candidateName: candidate?.name ?? null,
        candidateStage: candidate?.stage ?? null,
        requisitionTitle: requisition?.title ?? null,
        interviewerName: interviewer?.name ?? null,
        evaluation: evaluation ? serializeRow(evaluation) : null,
      });
    });
  }

  // ----- Evaluations -------------------------------------------------------------------

  async getEvaluation(interviewId: number): Promise<Row | undefined> {
    const row = await this.query
      .selectFrom('recruitingEvaluations')
      .select(EVALUATION_FIELDS as unknown as readonly string[])
      .where('interviewId', '=', interviewId)
      .executeTakeFirst();
    return row ? serializeRow(row) : undefined;
  }

  /**
   * Creates or updates the evaluation for an interview, then recomputes the candidate's overall score as the
   * average of the two ratings. The average is always derived here and never accepted from the client.
   */
  async submitEvaluation(
    interviewId: number,
    input: EvaluationInput,
    principalId: string,
  ): Promise<{ id: number; overallScore: number }> {
    const technicalScore = requireScore(input.technicalScore, 'technicalScore');
    const communicationScore = requireScore(
      input.communicationScore,
      'communicationScore',
    );
    const conclusion = requireEnum(
      input.conclusion,
      EVALUATION_CONCLUSIONS,
      'conclusion',
    );
    const overallScore =
      Math.round(((technicalScore + communicationScore) / 2) * 100) / 100;

    const interview = await this.query
      .selectFrom('recruitingInterviews')
      .select(['id', 'candidateId'])
      .where('id', '=', interviewId)
      .executeTakeFirst();
    if (!interview) {
      throw new RecruitingError(
        'INTERVIEW_NOT_FOUND',
        'Interview not found.',
        404,
      );
    }

    return this.database.transaction(async (connection) => {
      const now = new Date();
      const existing = await connection.query
        .selectFrom('recruitingEvaluations')
        .select('id')
        .where('interviewId', '=', interviewId)
        .executeTakeFirst();

      let id: number;
      if (existing) {
        await connection.query
          .updateTable('recruitingEvaluations')
          .set({
            technicalScore,
            communicationScore,
            conclusion,
            comments: input.comments ?? null,
            updatedAt: now,
          })
          .where('id', '=', Number(existing.id))
          .execute();
        id = Number(existing.id);
      } else {
        const result = await connection.query
          .insertInto('recruitingEvaluations')
          .values({
            interviewId,
            technicalScore,
            communicationScore,
            conclusion,
            comments: input.comments ?? null,
            createdById: principalId,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        id = await insertId(
          result.insertId,
          'recruitingEvaluations',
          connection.query,
        );
      }

      await connection.query
        .updateTable('recruitingCandidates')
        .set({ overallScore, updatedAt: now })
        .where('id', '=', Number(interview.candidateId))
        .execute();
      await connection.query
        .updateTable('recruitingInterviews')
        .set({ status: 'completed', updatedAt: now })
        .where('id', '=', interviewId)
        .execute();

      return { id, overallScore };
    });
  }

  // ----- Offers ------------------------------------------------------------------------

  async listOffers(
    conditions: DatabaseAuthorizationConditions,
    filters: { candidateId?: number; status?: string } = {},
  ): Promise<Row[]> {
    let builder = this.query
      .selectFrom('recruitingOffers')
      .select(selectColumns(conditions, OFFER_FIELDS))
      .where((eb) => compileFilter(eb, conditions.filter));
    if (filters.candidateId !== undefined) {
      builder = builder.where('candidateId', '=', filters.candidateId);
    }
    if (filters.status) {
      builder = builder.where('status', '=', filters.status);
    }
    const rows = await builder.orderBy('createdAt', 'desc').execute();
    return this.decorateOffers(rows);
  }

  /**
   * Creates an offer. A candidate may hold only one offer record; a duplicate is rejected with a readable message
   * rather than a database constraint error. The unique index is the last line of defence against a race.
   */
  async createOffer(
    input: OfferInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    assertInputFields(input, conditions.fields.input);
    const candidateId = requirePositiveInteger(
      input.candidateId,
      'candidateId',
    );
    const position = requireNonEmpty(input.position, 'position');
    const status = requireEnum(input.status, OFFER_STATUSES, 'status');

    const existing = await this.query
      .selectFrom('recruitingOffers')
      .select('id')
      .where('candidateId', '=', candidateId)
      .executeTakeFirst();
    if (existing) {
      throw new RecruitingError(
        'OFFER_ALREADY_EXISTS',
        'This candidate already has an offer. Only one offer is allowed per candidate.',
        409,
      );
    }

    const now = new Date();
    const result = await this.query
      .insertInto('recruitingOffers')
      .values({
        candidateId,
        position,
        salary: input.salary ?? null,
        expectedStartDate: toDate(input.expectedStartDate),
        status,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return insertId(result.insertId, 'recruitingOffers', this.query);
  }

  async updateOffer(
    id: number,
    input: OfferInput,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    assertInputFields(input, conditions.fields.input);
    const values: Row = { updatedAt: new Date() };
    if (input.position !== undefined)
      values.position = requireNonEmpty(input.position, 'position');
    if (input.salary !== undefined) values.salary = input.salary;
    if (input.expectedStartDate !== undefined)
      values.expectedStartDate = toDate(input.expectedStartDate);
    if (input.status !== undefined)
      values.status = requireEnum(input.status, OFFER_STATUSES, 'status');

    const result = await this.query
      .updateTable('recruitingOffers')
      .set(values)
      .where('id', '=', id)
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    return result.updatedCount ?? 0;
  }

  private async decorateOffers(rows: Row[]): Promise<Row[]> {
    if (rows.length === 0) return rows;
    const candidateIds = uniqueNumbers(
      rows.map((row) => row.candidateId as number | null),
    );
    const candidates = new Map<number, Row>();
    if (candidateIds.length > 0) {
      const candidateRows = await this.query
        .selectFrom('recruitingCandidates')
        .select(['id', 'name'])
        .where('id', 'in', candidateIds)
        .execute();
      for (const candidate of candidateRows) {
        candidates.set(Number(candidate.id), candidate);
      }
    }
    return rows.map((row) =>
      serializeRow({
        ...row,
        candidateName: candidates.get(Number(row.candidateId))?.name ?? null,
      }),
    );
  }

  // ----- Dashboard ---------------------------------------------------------------------

  async candidateStageDistribution(
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row[]> {
    return this.query
      .selectFrom('recruitingCandidates')
      .select(['requisitionId', 'stage'])
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
  }

  async requisitionStatusCounts(
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Map<string, number>> {
    const rows = await this.query
      .selectFrom('recruitingRequisitions')
      .select(['id', 'status'])
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    const counts = new Map<string, number>();
    for (const row of rows) {
      const status = String(row.status);
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return counts;
  }

  async interviewStatusCounts(
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Map<string, number>> {
    const rows = await this.query
      .selectFrom('recruitingInterviews')
      .select(['id', 'status'])
      .where((eb) => compileFilter(eb, conditions.filter))
      .execute();
    const counts = new Map<string, number>();
    for (const row of rows) {
      const status = String(row.status);
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return counts;
  }
}

// ----- Shared helpers ------------------------------------------------------------------

export const REQ_PRIORITIES = ['high', 'medium', 'low'] as const;
export const REQ_STATUSES = ['open', 'paused', 'completed'] as const;
export const CANDIDATE_SOURCES = [
  'referral',
  'job_board',
  'headhunter',
  'campus',
] as const;
export const CANDIDATE_STAGES = [
  'screening',
  'invited',
  'interviewing',
  'pending',
  'hired',
  'rejected',
] as const;
export const INTERVIEW_ROUNDS = ['initial', 'second', 'final'] as const;
export const INTERVIEW_STATUSES = [
  'scheduled',
  'completed',
  'cancelled',
] as const;
export const EVALUATION_CONCLUSIONS = ['pass', 'pending', 'fail'] as const;
export const OFFER_STATUSES = ['pending', 'accepted', 'declined'] as const;

/** Selects the registered field set the caller is authorized to read. */
export function selectColumns(
  conditions: DatabaseAuthorizationConditions,
  allFields: readonly string[],
): readonly string[] {
  const allowed = conditions.fields.output;
  if (allowed === '*') return allFields;
  const permitted = new Set(allowed);
  return allFields.filter((field) => permitted.has(field));
}

/** Rejects input fields outside the authorized write set. */
export function assertInputFields(
  input: object,
  allowed: '*' | readonly string[],
): void {
  if (allowed === '*') return;
  const rejected = Object.keys(input).filter(
    (field) => !allowed.includes(field),
  );
  if (rejected.length > 0) {
    throw new RecruitingError(
      'FIELD_NOT_ALLOWED',
      `Input fields are not authorized: ${rejected.join(', ')}`,
    );
  }
}

const filterOperators: Readonly<
  Record<DatabaseFilterOperator, ComparisonOperator>
> = {
  $eq: '=',
  $ne: '!=',
  $in: 'in',
  $notIn: 'not in',
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
};

/** Translates the authorization Filter AST into the query builder's own WHERE expressions. */
export function compileFilter(
  eb: ExpressionBuilder,
  filter: DatabaseFilter,
): Expression<SqlBool> {
  const expressions = Object.entries(filter).map(([field, value]) => {
    if (field === '$and' || field === '$or') {
      if (!Array.isArray(value)) {
        throw new TypeError(`${field} must be an array`);
      }
      const nested = (value as readonly DatabaseFilter[]).map((item) =>
        compileFilter(eb, item),
      );
      return field === '$and' ? eb.and(nested) : eb.or(nested);
    }
    if (!value || Array.isArray(value)) {
      throw new TypeError(`Invalid filter for ${field}`);
    }
    return eb.and(
      Object.entries(value).map(([operator, expected]) => {
        const comparison = filterOperators[operator as DatabaseFilterOperator];
        if (!comparison) {
          throw new TypeError(`Unknown filter operator: ${operator}`);
        }
        return eb(field, comparison, expected);
      }),
    );
  });
  return eb.and(expressions);
}

async function insertId(
  value: unknown,
  table: string,
  query: QueryAdapter,
): Promise<number> {
  if (value !== undefined && value !== null) return Number(value);
  const row = await query
    .selectFrom(table)
    .select('id')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  return Number(row?.id);
}

/**
 * The database stores datetime/date columns as epoch numbers and returns them as strings. Convert every `*At` and
 * `*Date` field, plus numeric decimals, into shapes the browser can render directly.
 */
function serializeRow(row: Row): Row {
  const result: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (/(At|Date)$/u.test(key)) {
      result[key] = toIsoString(value);
    } else if (
      (key === 'salary' || key === 'overallScore') &&
      typeof value === 'string'
    ) {
      const numeric = Number(value);
      result[key] = Number.isNaN(numeric) ? value : numeric;
    } else {
      result[key] = value;
    }
  }
  return result;
}

function toIsoString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === 'string' && /^\d+(?:\.\d+)?$/u.test(value)) {
    const date = new Date(Number(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function uniqueNumbers(values: readonly (number | null)[]): number[] {
  return [
    ...new Set(
      values
        .filter(
          (value): value is number => value !== null && value !== undefined,
        )
        .map((value) => Number(value)),
    ),
  ];
}

function toDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RecruitingError('INVALID_DATE', `Invalid date: ${value}`);
  }
  return date;
}

function requireNonEmpty(value: string | undefined, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RecruitingError(
      'REQUIRED_FIELD',
      `Field "${field}" is required.`,
    );
  }
  return value.trim();
}

function requireStrings<T extends object>(
  input: T,
  fields: readonly string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of fields) {
    result[field] = requireNonEmpty(
      (input as Record<string, unknown>)[field] as string | undefined,
      field,
    );
  }
  return result;
}

function requirePositiveInteger(
  value: number | undefined,
  field: string,
): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new RecruitingError(
      'REQUIRED_FIELD',
      `Field "${field}" must be a positive integer.`,
    );
  }
  return value;
}

function requireEnum<T extends string>(
  value: T | undefined,
  allowed: readonly T[],
  field: string,
): T {
  if (value === undefined || !allowed.includes(value)) {
    throw new RecruitingError(
      'INVALID_VALUE',
      `Field "${field}" must be one of: ${allowed.join(', ')}.`,
    );
  }
  return value;
}

function requireScore(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new RecruitingError(
      'INVALID_SCORE',
      `Field "${field}" must be an integer between 1 and 5.`,
    );
  }
  return value;
}
