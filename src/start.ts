import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from '@sentry/tanstackstart-react'
import { createStart } from '@tanstack/react-start'

/**
 * Sentry's middlewares capture server-side errors from HTTP requests and
 * server-function calls, and are listed first so they wrap everything else.
 * SSR render exceptions are not caught here; `RouteError` captures those.
 */
export const startInstance = createStart(() => ({
  requestMiddleware: [sentryGlobalRequestMiddleware],
  functionMiddleware: [sentryGlobalFunctionMiddleware],
}))
