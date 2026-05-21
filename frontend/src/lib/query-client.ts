import { QueryClient } from '@tanstack/react-query';

/**
 * Shared QueryClient for the whole app.
 *
 * Defaults:
 *  - 30s staleTime so navigation feels instant but data stays fresh.
 *  - 5min gcTime so cached pages survive a brief tab-away.
 *  - retry: 1 — fail fast on real bugs; the API client already retries 401→refresh.
 *  - refetch on window focus is on so users see fresh data when they come back.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * Centralized query keys. Importing from one place keeps invalidation
 * consistent and prevents typo-driven cache misses.
 */
export const qk = {
  me: () => ['me'] as const,
  workspaces: () => ['workspaces'] as const,

  workflows: (ws: string) => ['workflows', ws] as const,
  workflow: (ws: string, id: string) => ['workflows', ws, id] as const,
  workflowExecutions: (ws: string, id: string) =>
    ['workflows', ws, id, 'executions'] as const,

  leads: (ws: string, search?: string) => ['leads', ws, search ?? ''] as const,

  templates: (ws: string) => ['templates', ws] as const,

  campaigns: (ws: string) => ['campaigns', ws] as const,

  analyticsSummary: (ws: string) => ['analytics', ws, 'summary'] as const,
  analyticsExecutions: (ws: string, days: number) =>
    ['analytics', ws, 'executions', days] as const,

  queueStats: (ws: string) => ['queue', ws, 'stats'] as const,
};
