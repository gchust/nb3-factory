import { apiClientToken, useService } from '@nocobase/app-client';
import { useMemo } from 'react';

import { useAsyncData, type AsyncData } from './use-async-data.js';

export type ProjectStatus = 'planning' | 'active' | 'delivered' | 'paused';
export type MilestoneStatus = 'not_started' | 'in_progress' | 'completed';
export type TaskStatus = 'todo' | 'in_progress' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';
export type Timeliness = 'on_time' | 'overdue';
export type DeliveryRole = 'administrator' | 'manager' | 'member';

export interface DeliveryActor {
  userId: string;
  role: DeliveryRole;
}

export interface Project {
  id: number;
  name: string;
  clientName: string;
  managerId: string | null;
  managerName: string | null;
  startDate: string | null;
  endDate: string | null;
  budgetHours: number | null;
  status: ProjectStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Milestone {
  id: number;
  name: string;
  projectId: number;
  projectName: string | null;
  plannedDate: string | null;
  actualDate: string | null;
  status: MilestoneStatus;
}

export interface Task {
  id: number;
  name: string;
  projectId: number;
  projectName: string | null;
  milestoneId: number | null;
  milestoneName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  plannedDate: string | null;
  actualDate: string | null;
  description: string | null;
  timeliness: Timeliness | null;
  overdue: boolean;
}

export interface Timesheet {
  id: number;
  userId: string;
  userName: string | null;
  taskId: number;
  taskName: string | null;
  projectId: number;
  projectName: string | null;
  workDate: string;
  hours: number;
  description: string;
}

export interface Member {
  id: string;
  name: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string | null;
  contentUrl: string;
}

export interface DashboardProject {
  id: number;
  name: string;
  clientName: string;
  status: ProjectStatus;
  hours: number;
  taskCount: number;
  completedTaskCount: number;
  completionRate: number;
  overdueCount: number;
}

export interface Dashboard {
  projects: DashboardProject[];
  overdueTasks: Task[];
  totalHours: number;
}

/**
 * The subset of the application's HTTP client these pages use. Typed locally
 * so the client bundle does not depend on an undeclared package.
 */
export interface DeliveryApiClient {
  request<TResponse = unknown>(options: {
    path: string;
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    query?: Record<string, string | number | undefined>;
    json?: unknown;
    body?: BodyInit;
  }): Promise<TResponse>;
}

interface Envelope<T> {
  data: T;
}

export interface DeliveryApi {
  me(): Promise<DeliveryActor>;
  members(): Promise<Member[]>;
  listProjects(status?: string): Promise<Project[]>;
  createProject(input: Record<string, unknown>): Promise<Project>;
  updateProject(id: number, input: Record<string, unknown>): Promise<Project>;
  deleteProject(id: number): Promise<void>;
  listAttachments(projectId: number): Promise<Attachment[]>;
  uploadAttachment(projectId: number, file: File): Promise<Attachment>;
  deleteAttachment(projectId: number, fileId: string): Promise<void>;
  listMilestones(projectId?: number): Promise<Milestone[]>;
  createMilestone(input: Record<string, unknown>): Promise<Milestone>;
  updateMilestone(
    id: number,
    input: Record<string, unknown>,
  ): Promise<Milestone>;
  deleteMilestone(id: number): Promise<void>;
  listTasks(filter?: {
    projectId?: number;
    milestoneId?: number;
    assigneeId?: string;
  }): Promise<Task[]>;
  createTask(input: Record<string, unknown>): Promise<Task>;
  updateTask(id: number, input: Record<string, unknown>): Promise<Task>;
  deleteTask(id: number): Promise<void>;
  listTimesheets(filter?: {
    projectId?: number;
    taskId?: number;
    userId?: string;
  }): Promise<Timesheet[]>;
  createTimesheet(input: Record<string, unknown>): Promise<Timesheet>;
  updateTimesheet(
    id: number,
    input: Record<string, unknown>,
  ): Promise<Timesheet>;
  deleteTimesheet(id: number): Promise<void>;
  dashboard(): Promise<Dashboard>;
}

export function createDeliveryApi(client: DeliveryApiClient): DeliveryApi {
  const request = async <T>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      query?: Record<string, string | number | undefined>;
      json?: unknown;
      body?: BodyInit;
    } = {},
  ): Promise<T> => {
    const response = await client.request<Envelope<T>>({
      path: `delivery/${path}`,
      ...options,
    });
    return response.data;
  };

  return {
    me: () => request<DeliveryActor>('me'),
    members: () => request<Member[]>('members'),
    listProjects: (status) =>
      request<Project[]>('projects', { query: { status } }),
    createProject: (input) =>
      request<Project>('projects', { method: 'POST', json: input }),
    updateProject: (id, input) =>
      request<Project>(`projects/${id}`, { method: 'PATCH', json: input }),
    deleteProject: async (id) => {
      await request(`projects/${id}`, { method: 'DELETE' });
    },
    listAttachments: (projectId) =>
      request<Attachment[]>(`projects/${projectId}/attachments`),
    uploadAttachment: async (projectId, file) => {
      const body = new FormData();
      body.append('file', file);
      const response = await client.request<Envelope<Attachment>>({
        path: `delivery/projects/${projectId}/attachments`,
        method: 'POST',
        body,
      });
      return response.data;
    },
    deleteAttachment: async (projectId, fileId) => {
      await request(`projects/${projectId}/attachments/${fileId}`, {
        method: 'DELETE',
      });
    },
    listMilestones: (projectId) =>
      request<Milestone[]>('milestones', { query: { projectId } }),
    createMilestone: (input) =>
      request<Milestone>('milestones', { method: 'POST', json: input }),
    updateMilestone: (id, input) =>
      request<Milestone>(`milestones/${id}`, { method: 'PATCH', json: input }),
    deleteMilestone: async (id) => {
      await request(`milestones/${id}`, { method: 'DELETE' });
    },
    listTasks: (filter = {}) =>
      request<Task[]>('tasks', {
        query: {
          projectId: filter.projectId,
          milestoneId: filter.milestoneId,
          assigneeId: filter.assigneeId,
        },
      }),
    createTask: (input) =>
      request<Task>('tasks', { method: 'POST', json: input }),
    updateTask: (id, input) =>
      request<Task>(`tasks/${id}`, { method: 'PATCH', json: input }),
    deleteTask: async (id) => {
      await request(`tasks/${id}`, { method: 'DELETE' });
    },
    listTimesheets: (filter = {}) =>
      request<Timesheet[]>('timesheets', {
        query: {
          projectId: filter.projectId,
          taskId: filter.taskId,
          userId: filter.userId,
        },
      }),
    createTimesheet: (input) =>
      request<Timesheet>('timesheets', { method: 'POST', json: input }),
    updateTimesheet: (id, input) =>
      request<Timesheet>(`timesheets/${id}`, { method: 'PATCH', json: input }),
    deleteTimesheet: async (id) => {
      await request(`timesheets/${id}`, { method: 'DELETE' });
    },
    dashboard: () => request<Dashboard>('dashboard'),
  };
}

export function useDeliveryApi(): DeliveryApi {
  const client = useService(apiClientToken);
  return useMemo(
    () => createDeliveryApi(client as unknown as DeliveryApiClient),
    [client],
  );
}

export function useDeliveryActor(): AsyncData<DeliveryActor> {
  const api = useDeliveryApi();
  return useAsyncData(() => api.me(), [api]);
}

export function deliveryErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const record = error as { code?: unknown; message?: unknown };
    if (typeof record.code === 'string') return record.code;
    if (typeof record.message === 'string') return record.message;
  }
  if (typeof error === 'string') return error;
  return 'DELIVERY_UNKNOWN_ERROR';
}
