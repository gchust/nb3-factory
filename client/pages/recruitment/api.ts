import { ApiClientError, type ApiClient } from '@nocobase/app-client';

/**
 * Recruitment API client.
 *
 * Paths are relative to the configured API base URL; the deployment mount path
 * is never written here. The server owns authorization, so the client only
 * decides which controls to render.
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

export interface Me {
  readonly userId: string;
  readonly username: string;
  readonly name: string;
  readonly role: RecruitmentRole;
}

export interface Position {
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

export interface Candidate {
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

export interface Interview {
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
}

export interface OnboardingTodo {
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

export interface CandidateDetail {
  readonly candidate: Candidate;
  readonly interviews: Interview[];
  readonly onboarding: OnboardingTodo[];
}

export interface Stats {
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

export interface CandidateQuery {
  readonly search?: string;
  readonly stage?: string;
  readonly positionId?: string;
  readonly recruiterUsername?: string;
}

export interface InterviewQuery {
  readonly from?: string;
  readonly to?: string;
  readonly candidateId?: string;
  readonly interviewerUsername?: string;
}

export async function fetchMe(api: ApiClient): Promise<Me> {
  return unwrap(await api.request<{ data: Me }>({ path: 'recruitment/me' }));
}

export async function fetchStaff(api: ApiClient): Promise<StaffOption[]> {
  return unwrap(
    await api.request<{ data: StaffOption[] }>({ path: 'recruitment/staff' }),
  );
}

export async function fetchPositions(api: ApiClient): Promise<Position[]> {
  return unwrap(
    await api.request<{ data: Position[] }>({ path: 'recruitment/positions' }),
  );
}

export async function createPosition(
  api: ApiClient,
  input: Record<string, unknown>,
): Promise<Position> {
  return unwrap(
    await api.request<{ data: Position }>({
      path: 'recruitment/positions',
      method: 'POST',
      json: input,
    }),
  );
}

export async function updatePosition(
  api: ApiClient,
  id: string,
  input: Record<string, unknown>,
): Promise<Position> {
  return unwrap(
    await api.request<{ data: Position }>({
      path: `recruitment/positions/${encodeURIComponent(id)}`,
      method: 'PATCH',
      json: input,
    }),
  );
}

export async function fetchCandidates(
  api: ApiClient,
  query: CandidateQuery = {},
): Promise<Candidate[]> {
  return unwrap(
    await api.request<{ data: Candidate[] }>({
      path: 'recruitment/candidates',
      query: cleanQuery(query),
    }),
  );
}

export async function fetchCandidate(
  api: ApiClient,
  id: string,
): Promise<CandidateDetail> {
  return unwrap(
    await api.request<{ data: CandidateDetail }>({
      path: `recruitment/candidates/${encodeURIComponent(id)}`,
    }),
  );
}

export async function createCandidate(
  api: ApiClient,
  input: Record<string, unknown>,
): Promise<Candidate> {
  return unwrap(
    await api.request<{ data: Candidate }>({
      path: 'recruitment/candidates',
      method: 'POST',
      json: input,
    }),
  );
}

export async function updateCandidate(
  api: ApiClient,
  id: string,
  input: Record<string, unknown>,
): Promise<Candidate> {
  return unwrap(
    await api.request<{ data: Candidate }>({
      path: `recruitment/candidates/${encodeURIComponent(id)}`,
      method: 'PATCH',
      json: input,
    }),
  );
}

export async function changeStage(
  api: ApiClient,
  id: string,
  stage: string,
  reason?: string,
): Promise<Candidate> {
  return unwrap(
    await api.request<{ data: Candidate }>({
      path: `recruitment/candidates/${encodeURIComponent(id)}/stage`,
      method: 'POST',
      json: reason ? { stage, reason } : { stage },
    }),
  );
}

export async function fetchInterviews(
  api: ApiClient,
  query: InterviewQuery = {},
): Promise<Interview[]> {
  return unwrap(
    await api.request<{ data: Interview[] }>({
      path: 'recruitment/interviews',
      query: cleanQuery(query),
    }),
  );
}

export async function createInterview(
  api: ApiClient,
  input: Record<string, unknown>,
): Promise<Interview> {
  return unwrap(
    await api.request<{ data: Interview }>({
      path: 'recruitment/interviews',
      method: 'POST',
      json: input,
    }),
  );
}

export async function updateInterview(
  api: ApiClient,
  id: string,
  input: Record<string, unknown>,
): Promise<Interview> {
  return unwrap(
    await api.request<{ data: Interview }>({
      path: `recruitment/interviews/${encodeURIComponent(id)}`,
      method: 'PATCH',
      json: input,
    }),
  );
}

export async function completeInterview(
  api: ApiClient,
  id: string,
  input: Record<string, unknown>,
): Promise<Interview> {
  return unwrap(
    await api.request<{ data: Interview }>({
      path: `recruitment/interviews/${encodeURIComponent(id)}/complete`,
      method: 'POST',
      json: input,
    }),
  );
}

export async function fetchOnboarding(
  api: ApiClient,
): Promise<OnboardingTodo[]> {
  return unwrap(
    await api.request<{ data: OnboardingTodo[] }>({
      path: 'recruitment/onboarding',
    }),
  );
}

export async function setOnboardingStatus(
  api: ApiClient,
  id: string,
  status: 'pending' | 'done',
): Promise<OnboardingTodo> {
  return unwrap(
    await api.request<{ data: OnboardingTodo }>({
      path: `recruitment/onboarding/${encodeURIComponent(id)}`,
      method: 'PATCH',
      json: { status },
    }),
  );
}

export async function fetchStats(api: ApiClient): Promise<Stats> {
  return unwrap(
    await api.request<{ data: Stats }>({ path: 'recruitment/stats' }),
  );
}

function unwrap<T>(response: { data: T }): T {
  return response.data;
}

function cleanQuery(query: object): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' && value) cleaned[key] = value;
  }
  return cleaned;
}

/** Maps a failed request to a translation key so the UI stays localized. */
export function errorMessageKey(error: unknown): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'FORBIDDEN':
        return 'recruitment.errors.forbidden';
      case 'NOT_FOUND':
        return 'recruitment.errors.notFound';
      case 'UNAUTHENTICATED':
        return 'recruitment.errors.unauthenticated';
      case 'HIRE_REQUIRES_HR':
        return 'recruitment.errors.hireRequiresHr';
      case 'INVALID_TRANSITION':
        return 'recruitment.errors.invalidTransition';
      case 'VALIDATION':
        return 'recruitment.errors.validation';
      case 'CONFLICT':
        return 'recruitment.errors.conflict';
      default:
        break;
    }
    if (error.status === 401) return 'recruitment.errors.unauthenticated';
    if (error.status === 403) return 'recruitment.errors.forbidden';
    if (error.status === 404) return 'recruitment.errors.notFound';
    if (error.status === 409) return 'recruitment.errors.conflict';
    if (error.status === 400) return 'recruitment.errors.validation';
  }
  return 'recruitment.errors.unknown';
}
