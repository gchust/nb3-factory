import { Readable } from 'node:stream';

import type {
  DatabaseAuthorizationConditions,
  DatabaseAuthorizationParams,
} from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import {
  serverFileRepositoryManagerToken,
  type ServerFileRepository,
} from '@nocobase/app-plugin-file/server';
import { driveManagerToken } from '@nocobase/app-server/drive';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

import {
  CANDIDATE_FIELDS,
  CANDIDATE_STAGES,
  INTERVIEW_FIELDS,
  OFFER_FIELDS,
  REQUISITION_FIELDS,
  RecruitingError,
  recruitingServiceToken,
  type RecruitingService,
} from '../providers/recruiting-service.js';

const RESUMES_COLLECTION = 'recruitingResumes';
const RESUMES_DISK = 'local';
const RESUMES_ACCESS_PATH = '/uploads/candidate-resumes';

/**
 * Recruiting API. Every path lives on an isolated sub-router that installs authentication and the authorization
 * middleware itself, so nothing here depends on middleware installed elsewhere.
 *
 * Authorization is enforced at the route boundary: each operation asks the authorization registry for a decision and
 * passes the returned database conditions into the service, which applies them in the same SQL statement as the rest
 * of the query.
 */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const recruiting = app.container.resolve(recruitingServiceToken);

    const routes = new Hono<AuthorizationEnv>();
    routes.use('*', auth.required(), authorization.middleware());
    routes.onError((error, context) => {
      if (error instanceof HTTPException) return error.getResponse();
      if (error instanceof RecruitingError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status,
        );
      }
      throw error;
    });

    registerRequisitionRoutes(routes, recruiting);
    registerCandidateRoutes(routes, recruiting);
    registerInterviewRoutes(routes, recruiting);
    registerOfferRoutes(routes, recruiting);
    registerDashboardRoutes(routes, recruiting);
    registerResumeRoutes(routes, app);

    router.route('/recruiting', routes);
    return router;
  },
);

type RecruitingContext = Context<AuthorizationEnv>;

async function requireConditions(
  context: RecruitingContext,
  collection: string,
  action: string,
  fields: NonNullable<DatabaseAuthorizationParams['fields']> = {},
): Promise<DatabaseAuthorizationConditions> {
  const decision = await context
    .get('authz')
    .authorize<DatabaseAuthorizationParams>({
      resource: { type: 'database.collection', id: `main.${collection}` },
      action,
      params: { fields },
    });
  if (
    decision.effect !== 'conditional' ||
    decision.conditions?.type !== 'database'
  ) {
    throw new HTTPException(403, { message: 'Not allowed.' });
  }
  return decision.conditions as DatabaseAuthorizationConditions;
}

function principalId(context: RecruitingContext): string {
  return context.get('authz').identity.principal.id;
}

async function jsonBody<T>(context: RecruitingContext): Promise<T> {
  try {
    const value: unknown = await context.req.json();
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('Expected a JSON object');
    }
    return value as T;
  } catch {
    throw new HTTPException(400, { message: 'Invalid JSON body.' });
  }
}

function numericParam(context: RecruitingContext, name: string): number {
  const value = Number(context.req.param(name));
  if (!Number.isInteger(value) || value <= 0) {
    throw new HTTPException(400, { message: `Invalid ${name}.` });
  }
  return value;
}

// ----- Requisitions --------------------------------------------------------------------

function registerRequisitionRoutes(
  routes: Hono<AuthorizationEnv>,
  recruiting: RecruitingService,
): void {
  const resource = 'recruitingRequisitions';

  routes.get('/requisitions', async (context) => {
    const conditions = await requireConditions(context, resource, 'read', {
      output: [...REQUISITION_FIELDS],
      filter: ['status', 'title'],
      sort: ['createdAt'],
    });
    const status = context.req.query('status');
    const keyword = context.req.query('keyword');
    const data = await recruiting.listRequisitions(conditions, {
      ...(status ? { status } : {}),
      ...(keyword ? { keyword } : {}),
    });
    return context.json({ data });
  });

  routes.get('/requisitions/options', async (context) => {
    const conditions = await requireConditions(context, resource, 'read', {
      output: ['id', 'title', 'department', 'status'],
      sort: ['createdAt'],
      filter: ['id'],
    });
    return context.json({
      data: await recruiting.requisitionOptions(conditions),
    });
  });

  routes.get('/requisitions/:id', async (context) => {
    const conditions = await requireConditions(context, resource, 'read', {
      output: [...REQUISITION_FIELDS],
      filter: ['id'],
    });
    const data = await recruiting.getRequisition(
      numericParam(context, 'id'),
      conditions,
    );
    if (!data) {
      throw new RecruitingError('NOT_FOUND', 'Requisition not found.', 404);
    }
    return context.json({ data });
  });

  routes.post('/requisitions', async (context) => {
    const input = await jsonBody<Record<string, unknown>>(context);
    const conditions = await requireConditions(context, resource, 'create', {
      input: Object.keys(input),
      output: ['id'],
    });
    const id = await recruiting.createRequisition(input, conditions);
    return context.json({ data: { id } }, 201);
  });

  routes.patch('/requisitions/:id', async (context) => {
    const input = await jsonBody<Record<string, unknown>>(context);
    const conditions = await requireConditions(context, resource, 'update', {
      input: Object.keys(input),
      output: ['id'],
    });
    const updated = await recruiting.updateRequisition(
      numericParam(context, 'id'),
      input,
      conditions,
    );
    if (updated === 0) {
      throw new RecruitingError('NOT_FOUND', 'Requisition not found.', 404);
    }
    return context.json({ data: { updated } });
  });

  routes.delete('/requisitions/:id', async (context) => {
    const conditions = await requireConditions(context, resource, 'delete');
    const deleted = await recruiting.deleteRequisition(
      numericParam(context, 'id'),
      conditions,
    );
    if (deleted === 0) {
      throw new RecruitingError('NOT_FOUND', 'Requisition not found.', 404);
    }
    return context.json({ data: { deleted } });
  });
}

// ----- Candidates ----------------------------------------------------------------------

function registerCandidateRoutes(
  routes: Hono<AuthorizationEnv>,
  recruiting: RecruitingService,
): void {
  const resource = 'recruitingCandidates';

  routes.get('/candidates', async (context) => {
    const conditions = await requireConditions(context, resource, 'read', {
      output: [...CANDIDATE_FIELDS],
      filter: ['requisitionId', 'stage', 'name'],
      sort: ['createdAt'],
    });
    const requisitionId = context.req.query('requisitionId');
    const stage = context.req.query('stage');
    const keyword = context.req.query('keyword');
    const data = await recruiting.listCandidates(conditions, {
      ...(requisitionId ? { requisitionId: Number(requisitionId) } : {}),
      ...(stage ? { stage } : {}),
      ...(keyword ? { keyword } : {}),
    });
    return context.json({ data });
  });

  routes.get('/candidates/:id', async (context) => {
    const conditions = await requireConditions(context, resource, 'read', {
      output: [...CANDIDATE_FIELDS],
      filter: ['id'],
    });
    const data = await recruiting.getCandidate(
      numericParam(context, 'id'),
      conditions,
    );
    if (!data) {
      throw new RecruitingError('NOT_FOUND', 'Candidate not found.', 404);
    }
    return context.json({ data });
  });

  routes.post('/candidates', async (context) => {
    const input = await jsonBody<Record<string, unknown>>(context);
    const conditions = await requireConditions(context, resource, 'create', {
      input: Object.keys(input),
      output: ['id'],
    });
    const id = await recruiting.createCandidate(input, conditions);
    return context.json({ data: { id } }, 201);
  });

  routes.patch('/candidates/:id', async (context) => {
    const input = await jsonBody<Record<string, unknown>>(context);
    const conditions = await requireConditions(context, resource, 'update', {
      input: Object.keys(input),
      output: ['id'],
    });
    const updated = await recruiting.updateCandidate(
      numericParam(context, 'id'),
      input,
      conditions,
    );
    if (updated === 0) {
      throw new RecruitingError('NOT_FOUND', 'Candidate not found.', 404);
    }
    return context.json({ data: { updated } });
  });

  routes.delete('/candidates/:id', async (context) => {
    const conditions = await requireConditions(context, resource, 'delete');
    const deleted = await recruiting.deleteCandidate(
      numericParam(context, 'id'),
      conditions,
    );
    if (deleted === 0) {
      throw new RecruitingError('NOT_FOUND', 'Candidate not found.', 404);
    }
    return context.json({ data: { deleted } });
  });
}

// ----- Interviews and evaluations ------------------------------------------------------

function registerInterviewRoutes(
  routes: Hono<AuthorizationEnv>,
  recruiting: RecruitingService,
): void {
  const resource = 'recruitingInterviews';

  routes.get('/interviewers', async (context) => {
    // Scheduling picks an interviewer from this list, so it is gated on the ability to create interviews.
    await requireConditions(context, resource, 'create', {
      input: ['interviewerId'],
    });
    return context.json({ data: await recruiting.listInterviewers() });
  });

  routes.get('/interviews', async (context) => {
    const conditions = await requireConditions(context, resource, 'read', {
      output: [...INTERVIEW_FIELDS],
      filter: ['candidateId', 'status'],
      sort: ['scheduledAt'],
    });
    const candidateId = context.req.query('candidateId');
    const status = context.req.query('status');
    const data = await recruiting.listInterviews(conditions, {
      ...(candidateId ? { candidateId: Number(candidateId) } : {}),
      ...(status ? { status } : {}),
    });
    return context.json({ data });
  });

  routes.get('/interviews/:id', async (context) => {
    const conditions = await requireConditions(context, resource, 'read', {
      output: [...INTERVIEW_FIELDS],
      filter: ['id'],
    });
    const data = await recruiting.getInterview(
      numericParam(context, 'id'),
      conditions,
    );
    if (!data) {
      throw new RecruitingError('NOT_FOUND', 'Interview not found.', 404);
    }
    return context.json({ data });
  });

  routes.post('/interviews', async (context) => {
    const input = await jsonBody<Record<string, unknown>>(context);
    const conditions = await requireConditions(context, resource, 'create', {
      input: Object.keys(input),
      output: ['id'],
    });
    const id = await recruiting.createInterview(input, conditions);
    return context.json({ data: { id } }, 201);
  });

  routes.patch('/interviews/:id', async (context) => {
    const input = await jsonBody<Record<string, unknown>>(context);
    const conditions = await requireConditions(context, resource, 'update', {
      input: Object.keys(input),
      output: ['id'],
    });
    const updated = await recruiting.updateInterview(
      numericParam(context, 'id'),
      input,
      conditions,
    );
    if (updated === 0) {
      throw new RecruitingError('NOT_FOUND', 'Interview not found.', 404);
    }
    return context.json({ data: { updated } });
  });

  routes.get('/interviews/:id/evaluation', async (context) => {
    const id = numericParam(context, 'id');
    // Reuse interview visibility so an interviewer only reads evaluations for their own interviews.
    const conditions = await requireConditions(context, resource, 'read', {
      output: [...INTERVIEW_FIELDS],
      filter: ['id'],
    });
    const interview = await recruiting.getInterview(id, conditions);
    if (!interview) {
      throw new RecruitingError('NOT_FOUND', 'Interview not found.', 404);
    }
    const data = await recruiting.getEvaluation(id);
    return context.json({ data: data ?? null });
  });

  routes.post('/interviews/:id/evaluation', async (context) => {
    const id = numericParam(context, 'id');
    const input = await jsonBody<EvaluationInputBody>(context);

    const interviewConditions = await requireConditions(
      context,
      resource,
      'read',
      { output: [...INTERVIEW_FIELDS], filter: ['id'] },
    );
    const interview = await recruiting.getInterview(id, interviewConditions);
    if (!interview) {
      throw new RecruitingError('NOT_FOUND', 'Interview not found.', 404);
    }

    await requireConditions(context, 'recruitingEvaluations', 'create', {
      input: Object.keys(input),
      output: ['id'],
    });

    const result = await recruiting.submitEvaluation(
      id,
      input,
      principalId(context),
    );
    return context.json({ data: result });
  });
}

interface EvaluationInputBody {
  technicalScore: number;
  communicationScore: number;
  conclusion: string;
  comments?: string | null;
}

// ----- Offers --------------------------------------------------------------------------

function registerOfferRoutes(
  routes: Hono<AuthorizationEnv>,
  recruiting: RecruitingService,
): void {
  const resource = 'recruitingOffers';

  routes.get('/offers', async (context) => {
    const conditions = await requireConditions(context, resource, 'read', {
      output: [...OFFER_FIELDS],
      filter: ['candidateId', 'status'],
      sort: ['createdAt'],
    });
    const candidateId = context.req.query('candidateId');
    const status = context.req.query('status');
    const data = await recruiting.listOffers(conditions, {
      ...(candidateId ? { candidateId: Number(candidateId) } : {}),
      ...(status ? { status } : {}),
    });
    return context.json({ data });
  });

  routes.post('/offers', async (context) => {
    const input = await jsonBody<Record<string, unknown>>(context);
    const conditions = await requireConditions(context, resource, 'create', {
      input: Object.keys(input),
      output: ['id'],
    });
    const id = await recruiting.createOffer(input, conditions);
    return context.json({ data: { id } }, 201);
  });

  routes.patch('/offers/:id', async (context) => {
    const input = await jsonBody<Record<string, unknown>>(context);
    const conditions = await requireConditions(context, resource, 'update', {
      input: Object.keys(input),
      output: ['id'],
    });
    const updated = await recruiting.updateOffer(
      numericParam(context, 'id'),
      input,
      conditions,
    );
    if (updated === 0) {
      throw new RecruitingError('NOT_FOUND', 'Offer not found.', 404);
    }
    return context.json({ data: { updated } });
  });
}

// ----- Dashboard -----------------------------------------------------------------------

function registerDashboardRoutes(
  routes: Hono<AuthorizationEnv>,
  recruiting: RecruitingService,
): void {
  routes.get('/dashboard', async (context) => {
    const requisitionConditions = await requireConditions(
      context,
      'recruitingRequisitions',
      'read',
      { output: [...REQUISITION_FIELDS], sort: ['createdAt'] },
    );
    const candidateConditions = await requireConditions(
      context,
      'recruitingCandidates',
      'read',
      { output: [...CANDIDATE_FIELDS] },
    );
    const interviewConditions = await requireConditions(
      context,
      'recruitingInterviews',
      'read',
      { output: [...INTERVIEW_FIELDS] },
    );

    const [requisitions, candidates, interviewCounts] = await Promise.all([
      recruiting.listRequisitions(requisitionConditions),
      recruiting.candidateStageDistribution(candidateConditions),
      recruiting.interviewStatusCounts(interviewConditions),
    ]);

    const byRequisition = new Map<number, Record<string, number>>();
    let unassigned = 0;
    for (const candidate of candidates) {
      if (candidate.requisitionId === null) {
        unassigned += 1;
        continue;
      }
      const key = Number(candidate.requisitionId);
      const buckets = byRequisition.get(key) ?? emptyStageBuckets();
      const stage = String(candidate.stage);
      buckets[stage] = (buckets[stage] ?? 0) + 1;
      byRequisition.set(key, buckets);
    }

    const openRequisitions = requisitions.filter(
      (row) => row.status === 'open',
    ).length;

    return context.json({
      data: {
        totals: {
          openRequisitions,
          scheduledInterviews: interviewCounts.get('scheduled') ?? 0,
          totalCandidates: candidates.length,
        },
        stageKeys: [...CANDIDATE_STAGES],
        requisitions: requisitions.map((row) => ({
          id: Number(row.id),
          title: String(row.title),
          department: String(row.department),
          status: String(row.status),
          headcount: Number(row.headcount),
          stages: byRequisition.get(Number(row.id)) ?? emptyStageBuckets(),
        })),
        unassignedCandidates: unassigned,
      },
    });
  });
}

function emptyStageBuckets(): Record<string, number> {
  return Object.fromEntries(CANDIDATE_STAGES.map((stage) => [stage, 0]));
}

// ----- Resume files --------------------------------------------------------------------

function registerResumeRoutes(
  routes: Hono<AuthorizationEnv>,
  app: Application,
): void {
  const repository = (): ServerFileRepository =>
    app.container
      .resolve(serverFileRepositoryManagerToken)
      .repository(RESUMES_COLLECTION, {
        connection: 'main',
        disk: RESUMES_DISK,
        accessPath: RESUMES_ACCESS_PATH,
      });

  // Uploading a resume is part of creating a candidate, so it needs the candidate create grant.
  routes.post('/resumes', async (context) => {
    await requireConditions(context, 'recruitingCandidates', 'create', {
      input: ['resumeFileId'],
    });

    let body: Record<string, unknown>;
    try {
      body = await context.req.parseBody();
    } catch {
      throw new RecruitingError(
        'INVALID_MULTIPART',
        'Invalid multipart body.',
        400,
      );
    }
    const file = body.file;
    if (!(file instanceof File)) {
      throw new RecruitingError(
        'INVALID_FILE',
        'Exactly one file is required.',
        400,
      );
    }

    const { record } = await repository().uploadOne({ file });
    return context.json(
      {
        data: {
          fileId: record.id,
          filename: record.filename,
          size: record.size,
          mimeType: record.mimeType,
        },
      },
      201,
    );
  });

  // Downloading a resume is reading candidate data, so it needs the candidate read grant.
  routes.get('/resumes/:fileId/download', async (context) => {
    await requireConditions(context, 'recruitingCandidates', 'read', {
      output: ['resumeFileId'],
    });

    const fileId = context.req.param('fileId');
    const files = repository();
    const record = await files.findOne({ filter: { id: fileId } });
    if (!record) {
      throw new RecruitingError('NOT_FOUND', 'File not found.', 404);
    }

    const disk = app.container.resolve(driveManagerToken).use(record.disk);
    if (!(await disk.exists(record.key))) {
      throw new RecruitingError('NOT_FOUND', 'File not found.', 404);
    }

    context.header(
      'Content-Type',
      record.mimeType || 'application/octet-stream',
    );
    context.header('Content-Length', String(record.size));
    context.header('X-Content-Type-Options', 'nosniff');
    context.header(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(record.filename)}`,
    );
    return context.body(
      Readable.toWeb(await disk.getStream(record.key)) as ReadableStream,
    );
  });
}
