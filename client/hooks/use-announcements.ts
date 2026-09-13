import { apiClientToken, useService } from '@nocobase/app-client';
import { useMemo } from 'react';

export interface Announcement {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface CreateAnnouncementInput {
  readonly title: string;
  readonly body: string;
}

export interface AnnouncementsApi {
  list(): Promise<readonly Announcement[]>;
  create(input: CreateAnnouncementInput): Promise<Announcement>;
}

/**
 * Data access for the announcements board. The page owns the list state so its ordering and new-item behavior stay
 * with the UI; this hook only talks to the API through the application's own HTTP client.
 */
export function useAnnouncementsApi(): AnnouncementsApi {
  const api = useService(apiClientToken);

  return useMemo(
    () => ({
      async list() {
        const response = await api.request<{ data: Announcement[] }>({
          path: 'announcements',
        });
        return response.data;
      },
      async create(input: CreateAnnouncementInput) {
        const response = await api.request<
          { data: Announcement },
          CreateAnnouncementInput
        >({
          path: 'announcements',
          method: 'POST',
          json: input,
        });
        return response.data;
      },
    }),
    [api],
  );
}
