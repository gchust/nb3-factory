import { apiClientToken } from '@nocobase/app-client';
import type { ServiceToken } from '@nocobase/service-provider';

/** The type of the application's HTTP client, derived from the service token without importing its package. */
type TokenValue<T> = T extends ServiceToken<infer U> ? U : never;
export type RecruitingClient = TokenValue<typeof apiClientToken>;

export interface Requisition {
  id: number;
  title: string;
  department: string;
  headcount: number;
  requirements: string | null;
  expectedArrivalDate: string | null;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Candidate {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  requisitionId: number | null;
  source: string;
  stage: string;
  overallScore: number | null;
  resumeFileId: string | null;
  resumeFilename: string | null;
  requisitionTitle?: string | null;
  requisitionDepartment?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Evaluation {
  id: number;
  interviewId: number;
  technicalScore: number;
  communicationScore: number;
  conclusion: string;
  comments: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Interview {
  id: number;
  candidateId: number;
  round: string;
  scheduledAt: string;
  interviewerId: string | null;
  locationOrLink: string | null;
  status: string;
  candidateName?: string | null;
  candidateStage?: string | null;
  requisitionTitle?: string | null;
  interviewerName?: string | null;
  evaluation?: Evaluation | null;
  createdAt: string;
  updatedAt: string;
}

export interface Offer {
  id: number;
  candidateId: number;
  position: string;
  salary: number | null;
  expectedStartDate: string | null;
  status: string;
  candidateName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewerOption {
  id: string;
  name: string;
  email: string;
}

export interface DashboardRequisition {
  id: number;
  title: string;
  department: string;
  status: string;
  headcount: number;
  stages: Record<string, number>;
}

export interface DashboardData {
  totals: {
    openRequisitions: number;
    scheduledInterviews: number;
    totalCandidates: number;
  };
  stageKeys: string[];
  requisitions: DashboardRequisition[];
  unassignedCandidates: number;
}

interface Envelope<T> {
  data: T;
}

function query(
  values: Record<string, string | number | undefined>,
): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') result[key] = value;
  }
  return result;
}

export async function listRequisitions(
  client: RecruitingClient,
  filters: { status?: string; keyword?: string } = {},
): Promise<Requisition[]> {
  const response = await client.request<Envelope<Requisition[]>>({
    path: 'recruiting/requisitions',
    query: query(filters),
  });
  return response.data;
}

export async function requisitionOptions(
  client: RecruitingClient,
): Promise<Requisition[]> {
  const response = await client.request<Envelope<Requisition[]>>({
    path: 'recruiting/requisitions/options',
  });
  return response.data;
}

export async function createRequisition(
  client: RecruitingClient,
  input: Partial<Requisition>,
): Promise<number> {
  const response = await client.request<Envelope<{ id: number }>>({
    path: 'recruiting/requisitions',
    method: 'POST',
    json: input,
  });
  return response.data.id;
}

export async function updateRequisition(
  client: RecruitingClient,
  id: number,
  input: Partial<Requisition>,
): Promise<void> {
  await client.request({
    path: `recruiting/requisitions/${id}`,
    method: 'PATCH',
    json: input,
  });
}

export async function deleteRequisition(
  client: RecruitingClient,
  id: number,
): Promise<void> {
  await client.request({
    path: `recruiting/requisitions/${id}`,
    method: 'DELETE',
  });
}

export async function listCandidates(
  client: RecruitingClient,
  filters: { requisitionId?: number; stage?: string; keyword?: string } = {},
): Promise<Candidate[]> {
  const response = await client.request<Envelope<Candidate[]>>({
    path: 'recruiting/candidates',
    query: query(filters),
  });
  return response.data;
}

export async function getCandidate(
  client: RecruitingClient,
  id: number,
): Promise<Candidate> {
  const response = await client.request<Envelope<Candidate>>({
    path: `recruiting/candidates/${id}`,
  });
  return response.data;
}

export async function createCandidate(
  client: RecruitingClient,
  input: Partial<Candidate>,
): Promise<number> {
  const response = await client.request<Envelope<{ id: number }>>({
    path: 'recruiting/candidates',
    method: 'POST',
    json: input,
  });
  return response.data.id;
}

export async function updateCandidate(
  client: RecruitingClient,
  id: number,
  input: Partial<Candidate>,
): Promise<void> {
  await client.request({
    path: `recruiting/candidates/${id}`,
    method: 'PATCH',
    json: input,
  });
}

export async function listInterviews(
  client: RecruitingClient,
  filters: { candidateId?: number; status?: string } = {},
): Promise<Interview[]> {
  const response = await client.request<Envelope<Interview[]>>({
    path: 'recruiting/interviews',
    query: query(filters),
  });
  return response.data;
}

export async function createInterview(
  client: RecruitingClient,
  input: {
    candidateId: number;
    round: string;
    scheduledAt: string;
    interviewerId?: string | null;
    locationOrLink?: string | null;
    status?: string;
  },
): Promise<number> {
  const response = await client.request<Envelope<{ id: number }>>({
    path: 'recruiting/interviews',
    method: 'POST',
    json: { status: 'scheduled', ...input },
  });
  return response.data.id;
}

export async function updateInterview(
  client: RecruitingClient,
  id: number,
  input: Partial<Interview>,
): Promise<void> {
  await client.request({
    path: `recruiting/interviews/${id}`,
    method: 'PATCH',
    json: input,
  });
}

export async function listInterviewers(
  client: RecruitingClient,
): Promise<InterviewerOption[]> {
  const response = await client.request<Envelope<InterviewerOption[]>>({
    path: 'recruiting/interviewers',
  });
  return response.data;
}

export async function getEvaluation(
  client: RecruitingClient,
  interviewId: number,
): Promise<Evaluation | null> {
  const response = await client.request<Envelope<Evaluation | null>>({
    path: `recruiting/interviews/${interviewId}/evaluation`,
  });
  return response.data;
}

export async function submitEvaluation(
  client: RecruitingClient,
  interviewId: number,
  input: {
    technicalScore: number;
    communicationScore: number;
    conclusion: string;
    comments?: string;
  },
): Promise<{ id: number; overallScore: number }> {
  const response = await client.request<
    Envelope<{ id: number; overallScore: number }>
  >({
    path: `recruiting/interviews/${interviewId}/evaluation`,
    method: 'POST',
    json: input,
  });
  return response.data;
}

export async function listOffers(
  client: RecruitingClient,
  filters: { candidateId?: number; status?: string } = {},
): Promise<Offer[]> {
  const response = await client.request<Envelope<Offer[]>>({
    path: 'recruiting/offers',
    query: query(filters),
  });
  return response.data;
}

export async function createOffer(
  client: RecruitingClient,
  input: Partial<Offer>,
): Promise<number> {
  const response = await client.request<Envelope<{ id: number }>>({
    path: 'recruiting/offers',
    method: 'POST',
    json: input,
  });
  return response.data.id;
}

export async function updateOffer(
  client: RecruitingClient,
  id: number,
  input: Partial<Offer>,
): Promise<void> {
  await client.request({
    path: `recruiting/offers/${id}`,
    method: 'PATCH',
    json: input,
  });
}

export async function loadDashboard(
  client: RecruitingClient,
): Promise<DashboardData> {
  const response = await client.request<Envelope<DashboardData>>({
    path: 'recruiting/dashboard',
  });
  return response.data;
}

export async function uploadResume(
  client: RecruitingClient,
  file: File,
): Promise<{ fileId: string; filename: string; size: number }> {
  const body = new FormData();
  body.append('file', file);
  const response = await client.request<
    Envelope<{ fileId: string; filename: string; size: number }>
  >({
    path: 'recruiting/resumes',
    method: 'POST',
    body,
  });
  return response.data;
}
