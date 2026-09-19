import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import type {
  DatabaseManager,
  Expression,
  ExpressionBuilder,
  Row,
  SqlBool,
} from '@nocobase/db';

/**
 * Recruitment domain logic.
 *
 * Only HTTP concerns live in the route: this service receives an already
 * resolved actor (the signed-in account plus its recruitment role) and answers
 * with domain data or a `RecruitmentError`. Every ownership and state decision
 * happens here, in the same database statements that read or write.
 */

export type RecruitmentRole = 'hr' | 'recruiter' | 'interviewer' | 'none';

export const RECRUITMENT_STAGES = [
  'pending',
  'interviewed',
  'pending_offer',
  'offered',
  'onboarded',
  'rejected',
] as const;

export type RecruitmentStage = (typeof RECRUITMENT_STAGES)[number];

export const RECRUITMENT_ROLE_PERMISSION_SETS = {
  hrManager: 'recruitment-hr-manager',
  recruiter: 'recruitment-recruiter',
  interviewer: 'recruitment-interviewer',
} as const;

/**
 * Candidate attachment categories. Offer materials are restricted to the HR
 * manager and the owning recruiter; an interviewer only ever sees the resume
 * and portfolio needed to prepare for an interview.
 */
export const CANDIDATE_FILE_CATEGORIES = [
  'resume',
  'portfolio',
  'offer',
] as const;

export type CandidateFileCategory = (typeof CANDIDATE_FILE_CATEGORIES)[number];

/** The File Repository collection and content path this application owns. */
export const CANDIDATE_FILE_COLLECTION = 'recruitmentCandidateFiles';
export const CANDIDATE_FILE_ACCESS_PATH = '/uploads/recruitment-files';

/** One selection may attach at most five files. */
export const MAX_CANDIDATE_FILES_PER_ATTACH = 5;

/** Each attached file may be at most 5 MB; the upload control checks first. */
export const MAX_CANDIDATE_FILE_SIZE = 5 * 1024 * 1024;

export interface Actor {
  readonly userId: string;
  readonly username: string;
  readonly name: string;
  readonly role: RecruitmentRole;
}

export type RecruitmentErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'INVALID_TRANSITION'
  | 'HIRE_REQUIRES_HR'
  | 'CONFLICT';

export class RecruitmentError extends Error {
  public readonly code: RecruitmentErrorCode;
  public readonly status: number;

  constructor(code: RecruitmentErrorCode, message: string, status: number) {
    super(message);
    this.name = 'RecruitmentError';
    this.code = code;
    this.status = status;
  }
}

export interface PositionDto {
  readonly id: string;
  readonly title: string;
  readonly department: string;
  readonly headcount: number;
  readonly ownerUsername: string;
  readonly ownerName: string | null;
  readonly status: string;
  readonly description: string | null;
  readonly candidateCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CandidateDto {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly positionId: string;
  readonly positionTitle: string;
  readonly department: string;
  readonly recruiterUsername: string;
  readonly recruiterName: string | null;
  readonly stage: string;
  readonly source: string | null;
  readonly note: string | null;
  readonly hireConfirmedBy: string | null;
  readonly offeredAt: string | null;
  readonly onboardedAt: string | null;
  readonly rejectionReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface InterviewDto {
  readonly id: string;
  readonly candidateId: string;
  readonly candidateName: string;
  readonly positionId: string;
  readonly positionTitle: string;
  readonly interviewerUsername: string;
  readonly interviewerName: string | null;
  readonly scheduledAt: string;
  readonly method: string;
  readonly status: string;
  readonly result: string | null;
  readonly score: number | null;
  readonly evaluation: string | null;
  readonly completedAt: string | null;
  /** Resume version that was current when the interview was scheduled. */
  readonly resumeFileId: string | null;
  readonly resumeVersion: number | null;
}

export interface CandidateFileDto {
  readonly id: string;
  readonly candidateId: string | null;
  readonly category: CandidateFileCategory | null;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly version: number | null;
  readonly superseded: boolean;
  readonly uploadedByUsername: string | null;
  readonly uploadedByName: string | null;
  readonly disk: string;
  readonly key: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Same-origin path the browser fetches; access is checked by the server. */
  readonly contentUrl: string;
}

export interface OnboardingTodoDto {
  readonly id: string;
  readonly candidateId: string;
  readonly candidateName: string;
  readonly stage: string;
  readonly title: string;
  readonly status: string;
  readonly dueAt: string | null;
  readonly completedAt: string | null;
}

export interface StaffOption {
  readonly username: string;
  readonly name: string;
  readonly role: RecruitmentRole;
}

export interface CandidateFilters {
  readonly search?: string;
  readonly stage?: string;
  readonly positionId?: string;
  readonly recruiterUsername?: string;
}

export interface InterviewFilters {
  readonly from?: string;
  readonly to?: string;
  readonly candidateId?: string;
  readonly interviewerUsername?: string;
}

export interface StatsDto {
  readonly positions: {
    readonly total: number;
    readonly open: number;
    readonly headcount: number;
    readonly applied: number;
  };
  readonly candidates: {
    readonly total: number;
    readonly active: number;
    readonly byStage: Readonly<Record<string, number>>;
  };
  readonly interviews: {
    readonly total: number;
    readonly scheduled: number;
    readonly completed: number;
    readonly upcoming: number;
  };
  readonly offers: {
    readonly pending: number;
    readonly offered: number;
    readonly onboarded: number;
  };
  readonly byPosition: readonly {
    readonly positionId: string;
    readonly title: string;
    readonly department: string;
    readonly status: string;
    readonly headcount: number;
    readonly candidates: number;
    readonly onboarded: number;
  }[];
}

const ONBOARDING_TEMPLATE = [
  '发出录用通知书',
  '确认入职日期',
  '收集入职材料',
  '开通办公账号',
] as const;

const TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  pending: ['interviewed', 'rejected'],
  interviewed: ['pending_offer', 'rejected'],
  pending_offer: ['offered', 'rejected'],
  offered: ['onboarded'],
  onboarded: [],
  rejected: ['pending'],
};

export interface RecruitmentServiceOptions {
  readonly database: DatabaseManager;
  readonly authorization: Pick<AppAuthorization, 'permissionSets'>;
  /** Public mount path prepended to file content URLs; empty in tests. */
  readonly publicBasePath?: string;
  /** Best-effort physical object cleanup when an attachment row is removed. */
  readonly removeStoredObject?: (file: {
    readonly disk: string;
    readonly key: string;
  }) => Promise<void>;
}

type FilterInput =
  Expression<SqlBool> | ((eb: ExpressionBuilder) => Expression<SqlBool>);

export class RecruitmentService {
  private readonly database: DatabaseManager;
  private readonly authorization: Pick<AppAuthorization, 'permissionSets'>;
  private readonly publicBasePath: string;
  private readonly removeStoredObject?: (file: {
    readonly disk: string;
    readonly key: string;
  }) => Promise<void>;

  constructor(options: RecruitmentServiceOptions) {
    this.database = options.database;
    this.authorization = options.authorization;
    this.publicBasePath = (options.publicBasePath ?? '').replace(/\/$/, '');
    this.removeStoredObject = options.removeStoredObject;
  }

  private get query() {
    return this.database.query();
  }

  async resolveActor(userId: string): Promise<Actor> {
    const user = await this.query
      .selectFrom('user')
      .select(['id', 'username', 'name'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!user) {
      throw new RecruitmentError('UNAUTHENTICATED', 'Account not found.', 401);
    }
    const assignments =
      await this.authorization.permissionSets.listAssignments();
    const keys = new Set(
      assignments
        .filter(
          (assignment) =>
            assignment.subject.type === 'user' &&
            assignment.subject.id === userId,
        )
        .map((assignment) => assignment.permissionSet),
    );
    const role: RecruitmentRole =
      keys.has('system-administrator') ||
      keys.has(RECRUITMENT_ROLE_PERMISSION_SETS.hrManager)
        ? 'hr'
        : keys.has(RECRUITMENT_ROLE_PERMISSION_SETS.recruiter)
          ? 'recruiter'
          : keys.has(RECRUITMENT_ROLE_PERMISSION_SETS.interviewer)
            ? 'interviewer'
            : 'none';
    return {
      userId,
      username: typeof user.username === 'string' ? user.username : '',
      name: typeof user.name === 'string' ? user.name : '',
      role,
    };
  }

  // ---------------------------------------------------------------- positions

  async listPositions(actor: Actor): Promise<PositionDto[]> {
    this.assertKnown(actor);
    const positions = await this.query
      .selectFrom('recruitmentPositions')
      .selectAll()
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .execute();
    const counts = await this.candidateCountsByPosition(actor);
    return positions.map((row) =>
      mapPosition(row, counts.get(str(row.id)) ?? 0),
    );
  }

  async createPosition(
    actor: Actor,
    input: Record<string, unknown>,
  ): Promise<PositionDto> {
    this.assertRole(actor, ['hr']);
    const title = requiredString(input.title, 'title', 128);
    const department = requiredString(input.department, 'department', 64);
    const headcount = positiveInteger(input.headcount, 'headcount');
    const status = optionalStatus(input.status, ['open', 'closed'], 'open');
    const description = optionalString(input.description, 2000);
    const ownerUsername =
      optionalString(input.ownerUsername, 64) || actor.username;
    const now = new Date();
    const id = crypto.randomUUID();
    await this.query
      .insertInto('recruitmentPositions')
      .values({
        id,
        title,
        department,
        headcount,
        ownerUsername,
        ownerName: await this.nameForUsername(ownerUsername),
        status,
        description: description ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const row = await this.query
      .selectFrom('recruitmentPositions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return mapPosition(row, 0);
  }

  async updatePosition(
    actor: Actor,
    id: string,
    input: Record<string, unknown>,
  ): Promise<PositionDto> {
    this.assertRole(actor, ['hr']);
    const existing = await this.query
      .selectFrom('recruitmentPositions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!existing) {
      throw new RecruitmentError('NOT_FOUND', 'Position not found.', 404);
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) {
      patch.title = requiredString(input.title, 'title', 128);
    }
    if (input.department !== undefined) {
      patch.department = requiredString(input.department, 'department', 64);
    }
    if (input.headcount !== undefined) {
      patch.headcount = positiveInteger(input.headcount, 'headcount');
    }
    if (input.status !== undefined) {
      patch.status = optionalStatus(input.status, ['open', 'closed'], 'open');
    }
    if (input.description !== undefined) {
      patch.description = optionalString(input.description, 2000) ?? null;
    }
    if (input.ownerUsername !== undefined) {
      const ownerUsername = requiredString(
        input.ownerUsername,
        'ownerUsername',
        64,
      );
      patch.ownerUsername = ownerUsername;
      patch.ownerName = await this.nameForUsername(ownerUsername);
    }
    await this.query
      .updateTable('recruitmentPositions')
      .set(patch)
      .where('id', '=', id)
      .execute();
    const row = await this.query
      .selectFrom('recruitmentPositions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    const counts = await this.candidateCountsByPosition(actor);
    return mapPosition(row, counts.get(id) ?? 0);
  }

  // --------------------------------------------------------------- candidates

  async listCandidates(
    actor: Actor,
    filters: CandidateFilters = {},
  ): Promise<CandidateDto[]> {
    this.assertKnown(actor);
    const filter = this.candidateFilter(actor, filters);
    let builder = this.query.selectFrom('recruitmentCandidates').selectAll();
    if (filter) builder = builder.where(filter);
    const rows = await builder
      .orderBy('updatedAt', 'desc')
      .orderBy('id', 'desc')
      .execute();
    const positions = await this.positionMap();
    return rows.map((row) =>
      actor.role === 'interviewer'
        ? mapCandidateLimited(row, positions)
        : mapCandidate(row, positions),
    );
  }

  async getCandidate(
    actor: Actor,
    id: string,
  ): Promise<{
    candidate: CandidateDto;
    interviews: InterviewDto[];
    onboarding: OnboardingTodoDto[];
    files: CandidateFileDto[];
  }> {
    this.assertKnown(actor);
    const row = await this.query
      .selectFrom('recruitmentCandidates')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) {
      throw new RecruitmentError('NOT_FOUND', 'Candidate not found.', 404);
    }
    if (actor.role === 'interviewer') {
      // An interviewer may open a candidate they interview, and receives the
      // limited candidate view plus only their own interviews.
      const assigned = await this.query
        .selectFrom('recruitmentInterviews')
        .select('id')
        .where('candidateId', '=', id)
        .where('interviewerUsername', '=', actor.username)
        .executeTakeFirst();
      if (!assigned) {
        throw new RecruitmentError('FORBIDDEN', 'Not allowed.', 403);
      }
    } else {
      this.assertCandidateAccess(actor, row);
    }
    const positions = await this.positionMap();
    const interviews = await this.interviewsForCandidate(actor, id);
    const candidate =
      actor.role === 'interviewer'
        ? mapCandidateLimited(row, positions)
        : mapCandidate(row, positions);
    const onboarding =
      actor.role === 'interviewer' ? [] : await this.todosForCandidate(id);
    const allFiles = await this.filesForCandidate(id);
    // An interviewer never receives offer materials, even when assigned.
    const files =
      actor.role === 'interviewer'
        ? allFiles.filter(
            (file) =>
              file.category === 'resume' || file.category === 'portfolio',
          )
        : allFiles;
    return { candidate, interviews, onboarding, files };
  }

  async createCandidate(
    actor: Actor,
    input: Record<string, unknown>,
  ): Promise<CandidateDto> {
    this.assertRole(actor, ['hr', 'recruiter']);
    const name = requiredString(input.name, 'name', 64);
    const positionId = requiredString(input.positionId, 'positionId', 64);
    const position = await this.query
      .selectFrom('recruitmentPositions')
      .select('id')
      .where('id', '=', positionId)
      .executeTakeFirst();
    if (!position) {
      throw new RecruitmentError('VALIDATION', 'Position does not exist.', 400);
    }
    const requestedRecruiter = optionalString(input.recruiterUsername, 64);
    const recruiterUsername =
      actor.role === 'recruiter' ? actor.username : requestedRecruiter;
    if (!recruiterUsername) {
      throw new RecruitmentError(
        'VALIDATION',
        'A recruiter must be assigned.',
        400,
      );
    }
    const recruiterName =
      recruiterUsername === actor.username
        ? actor.name
        : await this.nameForUsername(recruiterUsername);
    const now = new Date();
    const id = crypto.randomUUID();
    await this.query
      .insertInto('recruitmentCandidates')
      .values({
        id,
        name,
        phone: optionalString(input.phone, 32) ?? null,
        email: optionalString(input.email, 128) ?? null,
        positionId,
        recruiterUsername,
        recruiterName,
        stage: 'pending',
        source: optionalString(input.source, 32) ?? null,
        note: optionalString(input.note, 2000) ?? null,
        hireConfirmedBy: null,
        hireConfirmedAt: null,
        offeredAt: null,
        onboardedAt: null,
        rejectedBy: null,
        rejectionReason: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const row = await this.query
      .selectFrom('recruitmentCandidates')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return mapCandidate(row, await this.positionMap());
  }

  async updateCandidate(
    actor: Actor,
    id: string,
    input: Record<string, unknown>,
  ): Promise<CandidateDto> {
    this.assertRole(actor, ['hr', 'recruiter']);
    const existing = await this.query
      .selectFrom('recruitmentCandidates')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!existing) {
      throw new RecruitmentError('NOT_FOUND', 'Candidate not found.', 404);
    }
    this.assertCandidateAccess(actor, existing);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined)
      patch.name = requiredString(input.name, 'name', 64);
    if (input.phone !== undefined)
      patch.phone = optionalString(input.phone, 32) ?? null;
    if (input.email !== undefined)
      patch.email = optionalString(input.email, 128) ?? null;
    if (input.source !== undefined)
      patch.source = optionalString(input.source, 32) ?? null;
    if (input.note !== undefined)
      patch.note = optionalString(input.note, 2000) ?? null;
    if (input.positionId !== undefined) {
      const positionId = requiredString(input.positionId, 'positionId', 64);
      const position = await this.query
        .selectFrom('recruitmentPositions')
        .select('id')
        .where('id', '=', positionId)
        .executeTakeFirst();
      if (!position) {
        throw new RecruitmentError(
          'VALIDATION',
          'Position does not exist.',
          400,
        );
      }
      patch.positionId = positionId;
    }
    if (input.recruiterUsername !== undefined) {
      if (actor.role !== 'hr') {
        throw new RecruitmentError(
          'FORBIDDEN',
          'Only HR can reassign a recruiter.',
          403,
        );
      }
      const recruiterUsername = requiredString(
        input.recruiterUsername,
        'recruiterUsername',
        64,
      );
      patch.recruiterUsername = recruiterUsername;
      patch.recruiterName = await this.nameForUsername(recruiterUsername);
    }
    await this.query
      .updateTable('recruitmentCandidates')
      .set(patch)
      .where('id', '=', id)
      .execute();
    const row = await this.query
      .selectFrom('recruitmentCandidates')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return mapCandidate(row, await this.positionMap());
  }

  async changeStage(
    actor: Actor,
    id: string,
    input: Record<string, unknown>,
  ): Promise<CandidateDto> {
    this.assertRole(actor, ['hr', 'recruiter']);
    const target = requiredString(input.stage, 'stage', 24);
    if (!(RECRUITMENT_STAGES as readonly string[]).includes(target)) {
      throw new RecruitmentError('VALIDATION', `Unknown stage: ${target}`, 400);
    }
    const row = await this.query
      .selectFrom('recruitmentCandidates')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) {
      throw new RecruitmentError('NOT_FOUND', 'Candidate not found.', 404);
    }
    this.assertCandidateAccess(actor, row);
    const current = str(row.stage);

    // Repeated operations are harmless: a candidate already in the target
    // stage is returned unchanged and never produces duplicate records.
    if (current === target) {
      return mapCandidate(row, await this.positionMap());
    }
    // Role requirement first: whatever stage the candidate is in, only the HR
    // manager may confirm a hire, and only HR may reopen a rejected candidate.
    if (target === 'offered' || target === 'onboarded') {
      if (actor.role !== 'hr') {
        throw new RecruitmentError(
          'HIRE_REQUIRES_HR',
          'Hiring must be confirmed by the HR manager.',
          403,
        );
      }
    }
    if (target === 'pending' && actor.role !== 'hr') {
      throw new RecruitmentError(
        'FORBIDDEN',
        'Only HR can reopen a rejected candidate.',
        403,
      );
    }
    if (!(TRANSITIONS[current] ?? []).includes(target)) {
      throw new RecruitmentError(
        'INVALID_TRANSITION',
        `Cannot move from ${current} to ${target}.`,
        409,
      );
    }

    const now = new Date();
    const patch: Record<string, unknown> = { stage: target, updatedAt: now };
    if (target === 'offered') {
      patch.hireConfirmedBy = actor.username;
      patch.hireConfirmedAt = now;
      patch.offeredAt = now;
      patch.rejectedBy = null;
      patch.rejectionReason = null;
    }
    if (target === 'onboarded') {
      patch.onboardedAt = now;
    }
    if (target === 'rejected') {
      patch.rejectedBy = actor.username;
      patch.rejectionReason = optionalString(input.reason, 1000) ?? null;
    }
    if (target === 'pending') {
      patch.rejectedBy = null;
      patch.rejectionReason = null;
    }

    await this.database.transaction(async (connection) => {
      await connection.query
        .updateTable('recruitmentCandidates')
        .set(patch)
        .where('id', '=', id)
        .where('stage', '=', current)
        .execute();
    });

    if (target === 'offered') {
      await this.ensureOnboardingTodos(id);
    }

    const updated = await this.query
      .selectFrom('recruitmentCandidates')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return mapCandidate(updated, await this.positionMap());
  }

  // --------------------------------------------------------------- interviews

  async listInterviews(
    actor: Actor,
    filters: InterviewFilters = {},
  ): Promise<InterviewDto[]> {
    this.assertKnown(actor);
    const filter = this.interviewFilter(actor, filters);
    let builder = this.query.selectFrom('recruitmentInterviews').selectAll();
    if (filter) builder = builder.where(filter);
    const rows = await builder
      .orderBy('scheduledAt', 'asc')
      .orderBy('id', 'asc')
      .execute();
    const positions = await this.positionMap();
    const candidates = await this.candidateNameMap();
    return rows.map((row) => mapInterview(row, candidates, positions));
  }

  async createInterview(
    actor: Actor,
    input: Record<string, unknown>,
  ): Promise<InterviewDto> {
    this.assertRole(actor, ['hr', 'recruiter']);
    const candidateId = requiredString(input.candidateId, 'candidateId', 64);
    const candidate = await this.query
      .selectFrom('recruitmentCandidates')
      .selectAll()
      .where('id', '=', candidateId)
      .executeTakeFirst();
    if (!candidate) {
      throw new RecruitmentError('NOT_FOUND', 'Candidate not found.', 404);
    }
    this.assertCandidateAccess(actor, candidate);
    const interviewerUsername = requiredString(
      input.interviewerUsername,
      'interviewerUsername',
      64,
    );
    if (!(await this.userExists(interviewerUsername))) {
      throw new RecruitmentError(
        'VALIDATION',
        'Interviewer account does not exist.',
        400,
      );
    }
    const scheduledAt = requiredDate(input.scheduledAt, 'scheduledAt');
    const method = optionalStatus(
      input.method,
      ['onsite', 'video', 'phone'],
      'onsite',
    );
    const existingRows = await this.query
      .selectFrom('recruitmentInterviews')
      .selectAll()
      .where('candidateId', '=', candidateId)
      .where('interviewerUsername', '=', interviewerUsername)
      .execute();
    const positions = await this.positionMap();
    const candidates = await this.candidateNameMap();
    const duplicate = existingRows.find((row) => {
      const iso = toIso(row.scheduledAt);
      return iso !== null && new Date(iso).getTime() === scheduledAt.getTime();
    });
    if (duplicate) {
      // Scheduling the same interview twice returns the original record.
      return mapInterview(duplicate, candidates, positions);
    }
    // Remember which resume version the interviewer was given.
    const activeResume = await this.activeResumeRow(candidateId);
    const now = new Date();
    const id = crypto.randomUUID();
    await this.query
      .insertInto('recruitmentInterviews')
      .values({
        id,
        candidateId,
        positionId: str(candidate.positionId),
        interviewerUsername,
        interviewerName: await this.nameForUsername(interviewerUsername),
        scheduledAt,
        method,
        status: 'scheduled',
        result: null,
        score: null,
        evaluation: null,
        completedAt: null,
        resumeFileId: activeResume ? str(activeResume.id) : null,
        resumeVersion: activeResume ? Number(activeResume.version ?? 1) : null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const row = await this.query
      .selectFrom('recruitmentInterviews')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return mapInterview(row, candidates, positions);
  }

  async updateInterview(
    actor: Actor,
    id: string,
    input: Record<string, unknown>,
  ): Promise<InterviewDto> {
    this.assertRole(actor, ['hr', 'recruiter']);
    const interview = await this.requireInterview(id);
    await this.assertInterviewCandidateAccess(actor, interview);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.scheduledAt !== undefined) {
      patch.scheduledAt = requiredDate(input.scheduledAt, 'scheduledAt');
    }
    if (input.method !== undefined) {
      patch.method = optionalStatus(
        input.method,
        ['onsite', 'video', 'phone'],
        'onsite',
      );
    }
    if (input.interviewerUsername !== undefined) {
      const username = requiredString(
        input.interviewerUsername,
        'interviewerUsername',
        64,
      );
      if (!(await this.userExists(username))) {
        throw new RecruitmentError(
          'VALIDATION',
          'Interviewer account does not exist.',
          400,
        );
      }
      patch.interviewerUsername = username;
      patch.interviewerName = await this.nameForUsername(username);
    }
    await this.query
      .updateTable('recruitmentInterviews')
      .set(patch)
      .where('id', '=', id)
      .execute();
    const row = await this.query
      .selectFrom('recruitmentInterviews')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return mapInterview(
      row,
      await this.candidateNameMap(),
      await this.positionMap(),
    );
  }

  async completeInterview(
    actor: Actor,
    id: string,
    input: Record<string, unknown>,
  ): Promise<InterviewDto> {
    this.assertKnown(actor);
    const interview = await this.requireInterview(id);
    const assigned =
      str(interview.interviewerUsername) === actor.username ||
      actor.role === 'hr';
    if (!assigned) {
      throw new RecruitmentError(
        'FORBIDDEN',
        'Only the assigned interviewer or HR can record an evaluation.',
        403,
      );
    }
    const score = optionalScore(input.score, 'score');
    const evaluation = optionalString(input.evaluation, 2000) ?? null;
    const result = optionalStatus(input.result, ['pass', 'fail'], 'pass');
    const now = new Date();
    await this.database.transaction(async (connection) => {
      await connection.query
        .updateTable('recruitmentInterviews')
        .set({
          status: 'completed',
          result,
          score,
          evaluation,
          completedAt: now,
          updatedAt: now,
        })
        .where('id', '=', id)
        .execute();
      // Advancing the candidate is idempotent: only a candidate still pending
      // an interview moves forward, so repeating this call changes nothing.
      await connection.query
        .updateTable('recruitmentCandidates')
        .set({ stage: 'interviewed', updatedAt: now })
        .where('id', '=', str(interview.candidateId))
        .where('stage', '=', 'pending')
        .execute();
    });
    const row = await this.query
      .selectFrom('recruitmentInterviews')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return mapInterview(
      row,
      await this.candidateNameMap(),
      await this.positionMap(),
    );
  }

  // --------------------------------------------------------------- onboarding

  async listOnboarding(actor: Actor): Promise<OnboardingTodoDto[]> {
    this.assertRole(actor, ['hr', 'recruiter']);
    const filter = this.candidateFilter(actor, {});
    const rows = await this.query
      .selectFrom('recruitmentOnboardingTodos')
      .selectAll()
      .where((eb) => {
        const scoped = eb.selectFrom('recruitmentCandidates').select('id');
        return eb('candidateId', 'in', filter ? scoped.where(filter) : scoped);
      })
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .execute();
    const candidates = await this.candidateRowMap();
    return rows.map((row) => mapTodo(row, candidates));
  }

  async setOnboardingStatus(
    actor: Actor,
    id: string,
    input: Record<string, unknown>,
  ): Promise<OnboardingTodoDto> {
    this.assertRole(actor, ['hr', 'recruiter']);
    const todo = await this.query
      .selectFrom('recruitmentOnboardingTodos')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!todo) {
      throw new RecruitmentError(
        'NOT_FOUND',
        'Onboarding task not found.',
        404,
      );
    }
    const candidate = await this.query
      .selectFrom('recruitmentCandidates')
      .selectAll()
      .where('id', '=', str(todo.candidateId))
      .executeTakeFirst();
    if (!candidate) {
      throw new RecruitmentError('NOT_FOUND', 'Candidate not found.', 404);
    }
    this.assertCandidateAccess(actor, candidate);
    const status = optionalStatus(input.status, ['pending', 'done'], 'done');
    const now = new Date();
    await this.query
      .updateTable('recruitmentOnboardingTodos')
      .set({
        status,
        completedAt: status === 'done' ? now : null,
        updatedAt: now,
      })
      .where('id', '=', id)
      .execute();
    const row = await this.query
      .selectFrom('recruitmentOnboardingTodos')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return mapTodo(row, await this.candidateRowMap());
  }

  // ------------------------------------------------------------------- files

  async listCandidateFiles(
    actor: Actor,
    candidateId: string,
  ): Promise<CandidateFileDto[]> {
    this.assertKnown(actor);
    const candidate = await this.requireCandidate(candidateId);
    if (actor.role === 'interviewer') {
      const assigned = await this.query
        .selectFrom('recruitmentInterviews')
        .select('id')
        .where('candidateId', '=', candidateId)
        .where('interviewerUsername', '=', actor.username)
        .executeTakeFirst();
      if (!assigned) {
        throw new RecruitmentError('FORBIDDEN', 'Not allowed.', 403);
      }
      const files = await this.filesForCandidate(candidateId);
      return files.filter(
        (file) => file.category === 'resume' || file.category === 'portfolio',
      );
    }
    this.assertCandidateAccess(actor, candidate);
    return this.filesForCandidate(candidateId);
  }

  /**
   * Link already-uploaded file records to a candidate under one category.
   *
   * The upload endpoint only writes file metadata, so a file is invisible until
   * this call stamps the association. Replacing a resume supersedes the previous
   * version instead of deleting it, and the new version number continues the
   * sequence.
   */
  async attachCandidateFiles(
    actor: Actor,
    candidateId: string,
    input: Record<string, unknown>,
  ): Promise<CandidateFileDto[]> {
    this.assertRole(actor, ['hr', 'recruiter']);
    const candidate = await this.requireCandidate(candidateId);
    this.assertCandidateAccess(actor, candidate);
    const category = requiredString(input.category, 'category', 16);
    if (!(CANDIDATE_FILE_CATEGORIES as readonly string[]).includes(category)) {
      throw new RecruitmentError('VALIDATION', 'Unknown file category.', 400);
    }
    const fileIds = Array.isArray(input.fileIds) ? input.fileIds : [];
    const unique = [...new Set(fileIds.map((id) => String(id)))].filter(
      (id) => id.length > 0,
    );
    if (unique.length === 0) {
      throw new RecruitmentError(
        'VALIDATION',
        'At least one file is required.',
        400,
      );
    }
    if (unique.length > MAX_CANDIDATE_FILES_PER_ATTACH) {
      throw new RecruitmentError(
        'VALIDATION',
        `At most ${MAX_CANDIDATE_FILES_PER_ATTACH} files may be attached at once.`,
        400,
      );
    }

    const rows: Row[] = [];
    for (const fileId of unique) {
      const file = await this.query
        .selectFrom('recruitmentCandidateFiles')
        .selectAll()
        .where('id', '=', fileId)
        .executeTakeFirst();
      if (!file) {
        throw new RecruitmentError('VALIDATION', 'File does not exist.', 400);
      }
      const size = Number(file.size ?? 0);
      if (size <= 0) {
        throw new RecruitmentError('VALIDATION', 'File is empty.', 400);
      }
      if (size > MAX_CANDIDATE_FILE_SIZE) {
        throw new RecruitmentError(
          'VALIDATION',
          'File exceeds the maximum size.',
          400,
        );
      }
      if (str(file.candidateId) || str(file.category)) {
        throw new RecruitmentError(
          'CONFLICT',
          'File is already attached to a record.',
          409,
        );
      }
      rows.push(file);
    }

    const now = new Date();
    const resumeVersions = await this.query
      .selectFrom('recruitmentCandidateFiles')
      .select('version')
      .where('candidateId', '=', candidateId)
      .where('category', '=', 'resume')
      .execute();
    let nextVersion =
      resumeVersions.reduce(
        (max, row) => Math.max(max, Number(row.version ?? 0)),
        0,
      ) + 1;

    const replace = input.replace === false ? false : true;
    if (category === 'resume' && replace) {
      await this.query
        .updateTable('recruitmentCandidateFiles')
        .set({ superseded: 1, supersededAt: now, updatedAt: now })
        .where('candidateId', '=', candidateId)
        .where('category', '=', 'resume')
        .where('superseded', '=', 0)
        .execute();
    }

    const attached: string[] = [];
    for (const file of rows) {
      const id = str(file.id);
      const patch: Record<string, unknown> = {
        candidateId,
        category,
        uploadedByUsername: actor.username,
        uploadedByName: actor.name || null,
        updatedAt: now,
      };
      if (category === 'resume') {
        patch.version = nextVersion;
        patch.superseded = 0;
        patch.supersededAt = null;
        nextVersion += 1;
      } else {
        patch.version = null;
        patch.superseded = 0;
        patch.supersededAt = null;
      }
      await this.query
        .updateTable('recruitmentCandidateFiles')
        .set(patch)
        .where('id', '=', id)
        .execute();
      attached.push(id);
    }

    const files = await this.filesForCandidate(candidateId);
    return files.filter((file) => attached.includes(file.id));
  }

  async removeCandidateFile(
    actor: Actor,
    candidateId: string,
    fileId: string,
  ): Promise<void> {
    this.assertRole(actor, ['hr', 'recruiter']);
    const candidate = await this.requireCandidate(candidateId);
    this.assertCandidateAccess(actor, candidate);
    const file = await this.query
      .selectFrom('recruitmentCandidateFiles')
      .selectAll()
      .where('id', '=', fileId)
      .executeTakeFirst();
    if (!file || str(file.candidateId) !== candidateId) {
      throw new RecruitmentError('NOT_FOUND', 'File not found.', 404);
    }
    await this.query
      .deleteFrom('recruitmentCandidateFiles')
      .where('id', '=', fileId)
      .execute();
    if (this.removeStoredObject) {
      try {
        await this.removeStoredObject({
          disk: str(file.disk),
          key: str(file.key),
        });
      } catch {
        // The metadata row is gone, so the file is no longer reachable; a
        // leftover storage object must not turn removal into a failure.
      }
    }
  }

  /**
   * Authorize a content request by the record the file is attached to. A file
   * that is not linked to a candidate is unreachable. Interviewers are denied
   * offer materials even when assigned to the candidate.
   */
  async assertFileContentAccess(actor: Actor, fileId: string): Promise<void> {
    this.assertKnown(actor);
    const file = await this.query
      .selectFrom('recruitmentCandidateFiles')
      .selectAll()
      .where('id', '=', fileId)
      .executeTakeFirst();
    if (!file) {
      throw new RecruitmentError('NOT_FOUND', 'File not found.', 404);
    }
    const candidateId = str(file.candidateId);
    const category = str(file.category);
    if (!candidateId || !category) {
      throw new RecruitmentError('NOT_FOUND', 'File not found.', 404);
    }
    const candidate = await this.requireCandidate(candidateId);
    if (actor.role === 'hr') return;
    if (actor.role === 'recruiter') {
      if (str(candidate.recruiterUsername) === actor.username) return;
      throw new RecruitmentError('FORBIDDEN', 'Not allowed.', 403);
    }
    if (actor.role === 'interviewer') {
      if (category === 'offer') {
        throw new RecruitmentError('FORBIDDEN', 'Not allowed.', 403);
      }
      const assigned = await this.query
        .selectFrom('recruitmentInterviews')
        .select('id')
        .where('candidateId', '=', candidateId)
        .where('interviewerUsername', '=', actor.username)
        .executeTakeFirst();
      if (assigned) return;
    }
    throw new RecruitmentError('FORBIDDEN', 'Not allowed.', 403);
  }

  // -------------------------------------------------------------------- staff

  async listStaff(actor: Actor): Promise<StaffOption[]> {
    this.assertRole(actor, ['hr', 'recruiter']);
    const assignments =
      await this.authorization.permissionSets.listAssignments();
    const roleByUser = new Map<string, RecruitmentRole>();
    for (const assignment of assignments) {
      if (assignment.subject.type !== 'user') continue;
      const mapped = roleForPermissionSet(assignment.permissionSet);
      if (!mapped) continue;
      const current = roleByUser.get(assignment.subject.id);
      if (!current || roleRank(mapped) > roleRank(current)) {
        roleByUser.set(assignment.subject.id, mapped);
      }
    }
    if (roleByUser.size === 0) return [];
    const users = await this.query
      .selectFrom('user')
      .select(['id', 'username', 'name'])
      .where('id', 'in', [...roleByUser.keys()])
      .execute();
    return users
      .map((user) => ({
        username: str(user.username),
        name: str(user.name),
        role: roleByUser.get(str(user.id)) ?? 'none',
      }))
      .filter((option) => option.username.length > 0)
      .sort((a, b) => a.username.localeCompare(b.username));
  }

  // -------------------------------------------------------------------- stats

  async stats(actor: Actor): Promise<StatsDto> {
    this.assertRole(actor, ['hr', 'recruiter']);
    const positions = await this.query
      .selectFrom('recruitmentPositions')
      .selectAll()
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .execute();
    const candidateFilter = this.candidateFilter(actor, {});
    let candidateQuery = this.query
      .selectFrom('recruitmentCandidates')
      .selectAll();
    if (candidateFilter) candidateQuery = candidateQuery.where(candidateFilter);
    const candidateRows = await candidateQuery.execute();
    const candidateIds = new Set(candidateRows.map((row) => str(row.id)));
    const interviewRows = await this.query
      .selectFrom('recruitmentInterviews')
      .selectAll()
      .execute();
    const scopedInterviews = interviewRows.filter((row) =>
      candidateIds.has(str(row.candidateId)),
    );

    const byStage: Record<string, number> = {};
    for (const stage of RECRUITMENT_STAGES) byStage[stage] = 0;
    for (const row of candidateRows) {
      const stage = str(row.stage);
      byStage[stage] = (byStage[stage] ?? 0) + 1;
    }
    const now = Date.now();
    const upcoming = scopedInterviews.filter((row) => {
      if (str(row.status) !== 'scheduled') return false;
      const iso = toIso(row.scheduledAt);
      return iso !== null && new Date(iso).getTime() >= now;
    }).length;

    const candidatesByPosition = new Map<string, number>();
    const onboardedByPosition = new Map<string, number>();
    for (const row of candidateRows) {
      const positionId = str(row.positionId);
      candidatesByPosition.set(
        positionId,
        (candidatesByPosition.get(positionId) ?? 0) + 1,
      );
      if (str(row.stage) === 'onboarded') {
        onboardedByPosition.set(
          positionId,
          (onboardedByPosition.get(positionId) ?? 0) + 1,
        );
      }
    }

    const activeStages = new Set([
      'pending',
      'interviewed',
      'pending_offer',
      'offered',
    ]);
    return {
      positions: {
        total: positions.length,
        open: positions.filter((row) => str(row.status) === 'open').length,
        headcount: positions.reduce(
          (sum, row) => sum + Number(row.headcount ?? 0),
          0,
        ),
        applied: candidateRows.length,
      },
      candidates: {
        total: candidateRows.length,
        active: candidateRows.filter((row) => activeStages.has(str(row.stage)))
          .length,
        byStage,
      },
      interviews: {
        total: scopedInterviews.length,
        scheduled: scopedInterviews.filter(
          (row) => str(row.status) === 'scheduled',
        ).length,
        completed: scopedInterviews.filter(
          (row) => str(row.status) === 'completed',
        ).length,
        upcoming,
      },
      offers: {
        pending: byStage.pending_offer ?? 0,
        offered: byStage.offered ?? 0,
        onboarded: byStage.onboarded ?? 0,
      },
      byPosition: positions.map((row) => {
        const id = str(row.id);
        return {
          positionId: id,
          title: str(row.title),
          department: str(row.department),
          status: str(row.status),
          headcount: Number(row.headcount ?? 0),
          candidates: candidatesByPosition.get(id) ?? 0,
          onboarded: onboardedByPosition.get(id) ?? 0,
        };
      }),
    };
  }

  // ----------------------------------------------------------------- helpers

  private assertKnown(actor: Actor): void {
    if (actor.role === 'none') {
      throw new RecruitmentError(
        'FORBIDDEN',
        'This account has no recruitment role.',
        403,
      );
    }
  }

  private assertRole(actor: Actor, roles: readonly RecruitmentRole[]): void {
    if (!roles.includes(actor.role)) {
      throw new RecruitmentError('FORBIDDEN', 'Not allowed.', 403);
    }
  }

  private assertCandidateAccess(actor: Actor, candidate: Row): void {
    if (actor.role === 'hr') return;
    if (actor.role === 'recruiter') {
      if (str(candidate.recruiterUsername) === actor.username) return;
      throw new RecruitmentError('FORBIDDEN', 'Not allowed.', 403);
    }
    throw new RecruitmentError('FORBIDDEN', 'Not allowed.', 403);
  }

  private async assertInterviewCandidateAccess(
    actor: Actor,
    interview: Row,
  ): Promise<void> {
    const candidate = await this.query
      .selectFrom('recruitmentCandidates')
      .selectAll()
      .where('id', '=', str(interview.candidateId))
      .executeTakeFirst();
    if (!candidate) {
      throw new RecruitmentError('NOT_FOUND', 'Candidate not found.', 404);
    }
    this.assertCandidateAccess(actor, candidate);
  }

  private candidateFilter(
    actor: Actor,
    filters: CandidateFilters,
  ): ((eb: ExpressionBuilder) => Expression<SqlBool>) | undefined {
    const parts: FilterInput[] = [];
    if (actor.role === 'recruiter') {
      parts.push((eb) => eb('recruiterUsername', '=', actor.username));
    }
    if (actor.role === 'interviewer') {
      parts.push((eb) =>
        eb(
          'id',
          'in',
          eb
            .selectFrom('recruitmentInterviews')
            .select('candidateId')
            .where('interviewerUsername', '=', actor.username),
        ),
      );
    }
    if (filters.stage) {
      const stage = filters.stage;
      parts.push((eb) => eb('stage', '=', stage));
    }
    if (filters.positionId) {
      const positionId = filters.positionId;
      parts.push((eb) => eb('positionId', '=', positionId));
    }
    if (filters.recruiterUsername && actor.role === 'hr') {
      const recruiterUsername = filters.recruiterUsername;
      parts.push((eb) => eb('recruiterUsername', '=', recruiterUsername));
    }
    if (filters.search) {
      const pattern = `%${filters.search}%`;
      parts.push((eb) =>
        eb.or([
          eb('name', 'like', pattern),
          eb('phone', 'like', pattern),
          eb('email', 'like', pattern),
        ]),
      );
    }
    if (parts.length === 0) return undefined;
    return (eb) => eb.and(parts);
  }

  private interviewFilter(
    actor: Actor,
    filters: InterviewFilters,
  ): ((eb: ExpressionBuilder) => Expression<SqlBool>) | undefined {
    const parts: FilterInput[] = [];
    if (actor.role === 'interviewer') {
      parts.push((eb) => eb('interviewerUsername', '=', actor.username));
    }
    if (filters.interviewerUsername && actor.role === 'hr') {
      const interviewerUsername = filters.interviewerUsername;
      parts.push((eb) => eb('interviewerUsername', '=', interviewerUsername));
    }
    if (filters.candidateId) {
      const candidateId = filters.candidateId;
      parts.push((eb) => eb('candidateId', '=', candidateId));
    }
    if (actor.role === 'recruiter') {
      parts.push((eb) =>
        eb(
          'candidateId',
          'in',
          eb
            .selectFrom('recruitmentCandidates')
            .select('id')
            .where('recruiterUsername', '=', actor.username),
        ),
      );
    }
    if (filters.from) {
      const from = requiredDate(filters.from, 'from');
      parts.push((eb) => eb('scheduledAt', '>=', toStoredDateTime(from)));
    }
    if (filters.to) {
      const to = requiredDate(filters.to, 'to');
      parts.push((eb) => eb('scheduledAt', '<=', toStoredDateTime(to)));
    }
    if (parts.length === 0) return undefined;
    return (eb) => eb.and(parts);
  }

  private async requireInterview(id: string): Promise<Row> {
    const interview = await this.query
      .selectFrom('recruitmentInterviews')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!interview) {
      throw new RecruitmentError('NOT_FOUND', 'Interview not found.', 404);
    }
    return interview;
  }

  private async requireCandidate(id: string): Promise<Row> {
    const candidate = await this.query
      .selectFrom('recruitmentCandidates')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!candidate) {
      throw new RecruitmentError('NOT_FOUND', 'Candidate not found.', 404);
    }
    return candidate;
  }

  private async filesForCandidate(
    candidateId: string,
  ): Promise<CandidateFileDto[]> {
    const rows = await this.query
      .selectFrom('recruitmentCandidateFiles')
      .selectAll()
      .where('candidateId', '=', candidateId)
      .orderBy('category', 'asc')
      .orderBy('version', 'desc')
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .execute();
    return rows.map((row) => mapCandidateFile(row, this.publicBasePath));
  }

  private async activeResumeRow(candidateId: string): Promise<Row | null> {
    const row = await this.query
      .selectFrom('recruitmentCandidateFiles')
      .selectAll()
      .where('candidateId', '=', candidateId)
      .where('category', '=', 'resume')
      .where('superseded', '=', 0)
      .orderBy('version', 'desc')
      .executeTakeFirst();
    return row ?? null;
  }

  private async interviewsForCandidate(
    actor: Actor,
    candidateId: string,
  ): Promise<InterviewDto[]> {
    let builder = this.query
      .selectFrom('recruitmentInterviews')
      .selectAll()
      .where('candidateId', '=', candidateId);
    if (actor.role === 'interviewer') {
      builder = builder.where('interviewerUsername', '=', actor.username);
    }
    const rows = await builder.orderBy('scheduledAt', 'asc').execute();
    const candidates = await this.candidateNameMap();
    const positions = await this.positionMap();
    return rows.map((row) => mapInterview(row, candidates, positions));
  }

  private async todosForCandidate(
    candidateId: string,
  ): Promise<OnboardingTodoDto[]> {
    const rows = await this.query
      .selectFrom('recruitmentOnboardingTodos')
      .selectAll()
      .where('candidateId', '=', candidateId)
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .execute();
    const candidates = await this.candidateRowMap();
    return rows.map((row) => mapTodo(row, candidates));
  }

  private async ensureOnboardingTodos(candidateId: string): Promise<void> {
    const existing = await this.query
      .selectFrom('recruitmentOnboardingTodos')
      .select('title')
      .where('candidateId', '=', candidateId)
      .execute();
    const titles = new Set(existing.map((row) => str(row.title)));
    const now = new Date();
    for (const title of ONBOARDING_TEMPLATE) {
      if (titles.has(title)) continue;
      await this.query
        .insertInto('recruitmentOnboardingTodos')
        .values({
          id: crypto.randomUUID(),
          candidateId,
          title,
          status: 'pending',
          dueAt: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  }

  private async candidateCountsByPosition(
    actor: Actor,
  ): Promise<Map<string, number>> {
    const filter = this.candidateFilter(actor, {});
    let builder = this.query
      .selectFrom('recruitmentCandidates')
      .select('positionId');
    if (filter) builder = builder.where(filter);
    const rows = await builder.execute();
    const counts = new Map<string, number>();
    for (const row of rows) {
      const positionId = str(row.positionId);
      counts.set(positionId, (counts.get(positionId) ?? 0) + 1);
    }
    return counts;
  }

  private async positionMap(): Promise<Map<string, Row>> {
    const rows = await this.query
      .selectFrom('recruitmentPositions')
      .selectAll()
      .execute();
    return new Map(rows.map((row) => [str(row.id), row]));
  }

  private async candidateNameMap(): Promise<Map<string, string>> {
    const rows = await this.query
      .selectFrom('recruitmentCandidates')
      .select(['id', 'name'])
      .execute();
    return new Map(rows.map((row) => [str(row.id), str(row.name)]));
  }

  private async candidateRowMap(): Promise<Map<string, Row>> {
    const rows = await this.query
      .selectFrom('recruitmentCandidates')
      .selectAll()
      .execute();
    return new Map(rows.map((row) => [str(row.id), row]));
  }

  private async userExists(username: string): Promise<boolean> {
    const user = await this.query
      .selectFrom('user')
      .select('id')
      .where('username', '=', username)
      .executeTakeFirst();
    return Boolean(user);
  }

  private async nameForUsername(username: string): Promise<string | null> {
    const user = await this.query
      .selectFrom('user')
      .select('name')
      .where('username', '=', username)
      .executeTakeFirst();
    return user ? str(user.name) : null;
  }
}

export function createRecruitmentService(
  options: RecruitmentServiceOptions,
): RecruitmentService {
  return new RecruitmentService(options);
}

function roleForPermissionSet(permissionSet: string): RecruitmentRole | null {
  if (
    permissionSet === 'system-administrator' ||
    permissionSet === RECRUITMENT_ROLE_PERMISSION_SETS.hrManager
  ) {
    return 'hr';
  }
  if (permissionSet === RECRUITMENT_ROLE_PERMISSION_SETS.recruiter) {
    return 'recruiter';
  }
  if (permissionSet === RECRUITMENT_ROLE_PERMISSION_SETS.interviewer) {
    return 'interviewer';
  }
  return null;
}

function roleRank(role: RecruitmentRole): number {
  return role === 'hr'
    ? 3
    : role === 'recruiter'
      ? 2
      : role === 'interviewer'
        ? 1
        : 0;
}

function str(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return '';
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'string') {
    // Datetimes are stored as UTC wall time without a timezone suffix
    // (`2026-09-05T02:00:00.000`), so mark it UTC before parsing. Without this
    // the value is read in the server's local zone and shifts.
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
      ? value
      : `${value}Z`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  return null;
}

/**
 * A datetime bound in the same format the driver stores: UTC wall time without
 * a timezone suffix. Binding a `Date` instead serializes to an epoch number,
 * which never compares less than the stored text and makes `to` filters match
 * nothing.
 */
function toStoredDateTime(date: Date): string {
  return date.toISOString().slice(0, 23);
}

function mapPosition(row: Row, candidateCount: number): PositionDto {
  return {
    id: str(row.id),
    title: str(row.title),
    department: str(row.department),
    headcount: Number(row.headcount ?? 0),
    ownerUsername: str(row.ownerUsername),
    ownerName: row.ownerName === null ? null : str(row.ownerName),
    status: str(row.status),
    description: row.description === null ? null : str(row.description),
    candidateCount,
    createdAt: str(toIso(row.createdAt)),
    updatedAt: str(toIso(row.updatedAt)),
  };
}

function mapCandidate(row: Row, positions: Map<string, Row>): CandidateDto {
  const position = positions.get(str(row.positionId));
  return {
    id: str(row.id),
    name: str(row.name),
    phone:
      row.phone === null || row.phone === undefined ? null : str(row.phone),
    email:
      row.email === null || row.email === undefined ? null : str(row.email),
    positionId: str(row.positionId),
    positionTitle: position ? str(position.title) : '',
    department: position ? str(position.department) : '',
    recruiterUsername: str(row.recruiterUsername),
    recruiterName:
      row.recruiterName === null || row.recruiterName === undefined
        ? null
        : str(row.recruiterName),
    stage: str(row.stage),
    source:
      row.source === null || row.source === undefined ? null : str(row.source),
    note: row.note === null || row.note === undefined ? null : str(row.note),
    hireConfirmedBy:
      row.hireConfirmedBy === null || row.hireConfirmedBy === undefined
        ? null
        : str(row.hireConfirmedBy),
    offeredAt: toIso(row.offeredAt),
    onboardedAt: toIso(row.onboardedAt),
    rejectionReason:
      row.rejectionReason === null || row.rejectionReason === undefined
        ? null
        : str(row.rejectionReason),
    createdAt: str(toIso(row.createdAt)),
    updatedAt: str(toIso(row.updatedAt)),
  };
}

/**
 * Interviewers only receive the candidate information needed to prepare for
 * and record an interview, never contact details or notes.
 */
function mapCandidateLimited(
  row: Row,
  positions: Map<string, Row>,
): CandidateDto {
  const position = positions.get(str(row.positionId));
  return {
    id: str(row.id),
    name: str(row.name),
    phone: null,
    email: null,
    positionId: str(row.positionId),
    positionTitle: position ? str(position.title) : '',
    department: position ? str(position.department) : '',
    recruiterUsername: '',
    recruiterName: null,
    stage: str(row.stage),
    source: null,
    note: null,
    hireConfirmedBy: null,
    offeredAt: null,
    onboardedAt: null,
    rejectionReason: null,
    createdAt: str(toIso(row.createdAt)),
    updatedAt: str(toIso(row.updatedAt)),
  };
}

function mapInterview(
  row: Row,
  candidates: Map<string, string>,
  positions: Map<string, Row>,
): InterviewDto {
  const position = positions.get(str(row.positionId));
  return {
    id: str(row.id),
    candidateId: str(row.candidateId),
    candidateName: candidates.get(str(row.candidateId)) ?? '',
    positionId: str(row.positionId),
    positionTitle: position ? str(position.title) : '',
    interviewerUsername: str(row.interviewerUsername),
    interviewerName:
      row.interviewerName === null || row.interviewerName === undefined
        ? null
        : str(row.interviewerName),
    scheduledAt: str(toIso(row.scheduledAt)),
    method: str(row.method),
    status: str(row.status),
    result:
      row.result === null || row.result === undefined ? null : str(row.result),
    score:
      row.score === null || row.score === undefined ? null : Number(row.score),
    evaluation:
      row.evaluation === null || row.evaluation === undefined
        ? null
        : str(row.evaluation),
    completedAt: toIso(row.completedAt),
    resumeFileId: toNullableString(row.resumeFileId),
    resumeVersion:
      row.resumeVersion === null || row.resumeVersion === undefined
        ? null
        : Number(row.resumeVersion),
  };
}

function mapCandidateFile(row: Row, publicBasePath: string): CandidateFileDto {
  const id = str(row.id);
  const ext = str(row.ext);
  const encoded = encodeURIComponent(id);
  return {
    id,
    candidateId: toNullableString(row.candidateId),
    category: toNullableString(row.category) as CandidateFileCategory | null,
    filename: str(row.filename),
    ext,
    mimeType: str(row.mimeType),
    size: Number(row.size ?? 0),
    version:
      row.version === null || row.version === undefined
        ? null
        : Number(row.version),
    superseded: Number(row.superseded ?? 0) === 1,
    uploadedByUsername: toNullableString(row.uploadedByUsername),
    uploadedByName: toNullableString(row.uploadedByName),
    disk: str(row.disk),
    key: str(row.key),
    createdAt: str(toIso(row.createdAt)),
    updatedAt: str(toIso(row.updatedAt)),
    contentUrl: `${publicBasePath}${CANDIDATE_FILE_ACCESS_PATH}/${encoded}${
      ext ? `.${encodeURIComponent(ext)}` : ''
    }`,
  };
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = str(value);
  return text.length ? text : null;
}

function mapTodo(row: Row, candidates: Map<string, Row>): OnboardingTodoDto {
  const candidate = candidates.get(str(row.candidateId));
  return {
    id: str(row.id),
    candidateId: str(row.candidateId),
    candidateName: candidate ? str(candidate.name) : '',
    stage: candidate ? str(candidate.stage) : '',
    title: str(row.title),
    status: str(row.status),
    dueAt: toIso(row.dueAt),
    completedAt: toIso(row.completedAt),
  };
}

// ----------------------------------------------------------------- validation

function requiredString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new RecruitmentError('VALIDATION', `${field} is required.`, 400);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new RecruitmentError('VALIDATION', `${field} is too long.`, 400);
  }
  return trimmed;
}

function optionalString(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new RecruitmentError('VALIDATION', 'Invalid text value.', 400);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) {
    throw new RecruitmentError('VALIDATION', 'Text value is too long.', 400);
  }
  return trimmed;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10000) {
    throw new RecruitmentError(
      'VALIDATION',
      `${field} must be a positive integer.`,
      400,
    );
  }
  return parsed;
}

function optionalStatus(
  value: unknown,
  allowed: readonly string[],
  fallback: string,
): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new RecruitmentError('VALIDATION', 'Unsupported value.', 400);
  }
  return value;
}

function optionalScore(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new RecruitmentError(
      'VALIDATION',
      `${field} must be an integer between 0 and 100.`,
      400,
    );
  }
  return parsed;
}

function requiredDate(value: unknown, field: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  throw new RecruitmentError(
    'VALIDATION',
    `${field} must be a valid date.`,
    400,
  );
}
