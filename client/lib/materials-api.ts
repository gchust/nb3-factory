import type { ApiClient } from '@nocobase/app-client';

/** A material the caller is permitted to read. */
export interface Material {
  id: number;
  title: string;
  body: string;
  visibility: string;
  updatedAt: string;
}

/** The material an answer was grounded in, linked from the citation. */
export interface Citation {
  id: number;
  title: string;
}

export type AnswerOutcome = 'answered' | 'insufficient' | 'denied';

export interface AssistantAnswer {
  answer: string;
  citations: Citation[];
  grounded: boolean;
  outcome: AnswerOutcome;
  notice: 'ai-not-configured' | 'ai-unavailable' | null;
  llm: { configured: boolean; used: boolean };
}

export interface AssistantMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  /** Null on a user turn; how the assistant answered on an assistant turn. */
  outcome: AnswerOutcome | null;
  createdAt: string;
}

export interface MaterialsList {
  materials: Material[];
  canManage: boolean;
}

export interface MaterialUpdate {
  title?: string;
  body?: string;
  visibility?: string;
}

export async function fetchMaterials(api: ApiClient): Promise<MaterialsList> {
  const response = await api.request<{ data: MaterialsList }>({
    path: 'materials',
    method: 'GET',
  });
  return response.data;
}

export async function updateMaterial(
  api: ApiClient,
  id: number,
  values: MaterialUpdate,
): Promise<Material> {
  const response = await api.request<{ data: Material }>({
    path: `materials/${id}`,
    method: 'PATCH',
    json: values,
  });
  return response.data;
}

export async function askAssistant(
  api: ApiClient,
  question: string,
): Promise<AssistantAnswer> {
  const response = await api.request<{ data: AssistantAnswer }>({
    path: 'assistant/ask',
    method: 'POST',
    json: { question },
  });
  return response.data;
}

export async function fetchMessages(
  api: ApiClient,
): Promise<AssistantMessage[]> {
  const response = await api.request<{ data: AssistantMessage[] }>({
    path: 'assistant/messages',
    method: 'GET',
  });
  return response.data;
}

/** Whether an optional model service is configured, so the page can say which mode it is in. */
export async function fetchAssistantStatus(api: ApiClient): Promise<boolean> {
  const response = await api.request<{ data: { configured: boolean } }>({
    path: 'assistant/status',
    method: 'GET',
  });
  return response.data.configured;
}

export async function clearMessages(api: ApiClient): Promise<void> {
  await api.request({
    path: 'assistant/messages',
    method: 'DELETE',
  });
}
