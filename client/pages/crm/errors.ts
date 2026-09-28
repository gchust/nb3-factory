import { ApiClientError } from '@nocobase/app-client';

import { toast } from '@/components/ui/toast';

/**
 * Show the failure as a toast. A client error carries a message the server
 * wrote for the user; any other failure (network, unexpected server error) is
 * reported with the caller's own wording rather than an internal detail.
 */
export function reportError(error: unknown, fallback: string): void {
  const description =
    error instanceof ApiClientError && error.message
      ? error.message
      : undefined;
  toast.add({ type: 'error', title: fallback, description });
}
