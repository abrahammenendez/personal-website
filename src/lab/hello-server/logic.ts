import { z } from 'zod'

/** Generated server-side, so a response proves the Worker ran it. */
export const serverInfoSchema = z.object({
  now: z.iso.datetime(),
  random: z.number().int().min(0).max(999),
})

export type ServerInfo = z.infer<typeof serverInfoSchema>

/** Pure, so it is testable without a server-function runtime. */
export function buildServerInfo(): ServerInfo {
  return serverInfoSchema.parse({
    now: new Date().toISOString(),
    random: Math.floor(Math.random() * 1000),
  })
}

/** Validated on the server: client input is untrusted, so bounds hold there. */
export const echoInputSchema = z.object({
  message: z.string().trim().min(1, 'Say something').max(100, 'Keep it under 100 characters'),
})

export type EchoInput = z.infer<typeof echoInputSchema>

export const echoResultSchema = z.object({
  received: z.string(),
  length: z.number().int(),
  at: z.iso.datetime(),
})

export type EchoResult = z.infer<typeof echoResultSchema>

export function buildEcho(input: EchoInput): EchoResult {
  return echoResultSchema.parse({
    received: input.message.toUpperCase(),
    length: input.message.length,
    at: new Date().toISOString(),
  })
}
