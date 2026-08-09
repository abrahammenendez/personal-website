import { QueryClient } from '@tanstack/react-query'

/** Called once per render tree, which on the server means once per request. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
      },
    },
  })
}
