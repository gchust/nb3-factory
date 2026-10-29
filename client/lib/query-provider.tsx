import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactElement, type ReactNode, useState } from 'react';

/**
 * The application's one React Query cache. The inbox hooks and the route
 * overlay pages share it, so they must mount below this provider.
 */
export function AppQueryProvider({
  children,
}: {
  readonly children?: ReactNode;
}): ReactElement {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: { retry: 0 },
          queries: { retry: 1, staleTime: 15_000 },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
