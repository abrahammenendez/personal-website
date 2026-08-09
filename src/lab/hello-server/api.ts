import { createServerFn } from '@tanstack/react-start'
import { buildEcho, buildServerInfo, echoInputSchema } from './logic'

export const getServerInfo = createServerFn({ method: 'GET' }).handler(() => buildServerInfo())

/** `validator` runs on the Worker, so a bad payload never reaches the handler. */
export const echoMessage = createServerFn({ method: 'POST' })
  .validator((input: unknown) => echoInputSchema.parse(input))
  .handler(({ data }) => buildEcho(data))
