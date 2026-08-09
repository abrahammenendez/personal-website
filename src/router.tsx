import type { QueryClient } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { RouteError } from '@/components/RouteError'
import { makeQueryClient } from '@/lib/query'
import { setupClientSentry } from '@/lib/sentry-client'
import { routeTree } from './routeTree.gen'

/** Available in every route's `beforeLoad`/`loader`, for prefetching. */
export interface RouterContext {
  queryClient: QueryClient
}

export function getRouter() {
  const queryClient = makeQueryClient()

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient } satisfies RouterContext,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultErrorComponent: RouteError,
  })

  // Also wraps the app in a QueryClientProvider, so no manual one is needed.
  setupRouterSsrQueryIntegration({ router, queryClient })
  setupClientSentry(router)

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
