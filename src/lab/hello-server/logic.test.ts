import { describe, expect, it } from 'vitest'
import { buildEcho, buildServerInfo, echoInputSchema, serverInfoSchema } from './logic'

describe('buildServerInfo', () => {
  it('returns a payload matching the schema', () => {
    expect(() => serverInfoSchema.parse(buildServerInfo())).not.toThrow()
  })

  it('emits an ISO timestamp', () => {
    expect(buildServerInfo().now).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('echoInputSchema', () => {
  it('rejects a blank message', () => {
    expect(echoInputSchema.safeParse({ message: '   ' }).success).toBe(false)
  })

  it('rejects a message over 100 characters', () => {
    expect(echoInputSchema.safeParse({ message: 'a'.repeat(101) }).success).toBe(false)
  })

  it('trims a valid message', () => {
    expect(echoInputSchema.parse({ message: '  hi  ' }).message).toBe('hi')
  })
})

describe('buildEcho', () => {
  it('uppercases the message and reports its length', () => {
    expect(buildEcho({ message: 'hello' })).toMatchObject({ received: 'HELLO', length: 5 })
  })
})
