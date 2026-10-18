import type { QueryKey } from '@tanstack/react-query';

export const libraryKeys = {
  all: ['library'] as const,
  documents: (
    q: string,
    page: number,
    pageSize: number,
    mine = false,
  ): QueryKey => [...libraryKeys.all, 'documents', { q, page, pageSize, mine }],
  document: (id: string): QueryKey => [...libraryKeys.all, 'document', id],
  shareCandidates: (): QueryKey => [...libraryKeys.all, 'shareCandidates'],
  shares: (id: string): QueryKey => [
    ...libraryKeys.all,
    'document',
    id,
    'shares',
  ],
};
