// @vitest-environment node

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from '@/api/run/route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/run', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('app/api/run/route', () => {
  const originalToken = process.env.GLOT_API_TOKEN

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.GLOT_API_TOKEN = 'test-token'
  })

  afterEach(() => {
    process.env.GLOT_API_TOKEN = originalToken
  })

  it('returns 400 for unsupported language', async () => {
    const res = await POST(req({ language: 'kotlin', code: 'println(1)' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Unsupported language: kotlin',
    })
  })

  it('returns 400 for empty code', async () => {
    const res = await POST(req({ language: 'javascript', code: '   ' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'No code provided' })
  })

  it('returns 400 when code is too large', async () => {
    const tooLarge = 'a'.repeat(200_001)
    const res = await POST(req({ language: 'javascript', code: tooLarge }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Code too large' })
  })

  it('returns 500 when token is missing', async () => {
    delete process.env.GLOT_API_TOKEN

    const res = await POST(req({ language: 'javascript', code: 'console.log(1)' }))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      error: 'GLOT_API_TOKEN not configured',
    })
  })

  it('returns 502 when glot responds with non-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('', {
          status: 429,
          statusText: 'Too Many Requests',
        })
      )
    )

    const res = await POST(req({ language: 'javascript', code: 'console.log(1)' }))
    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toEqual({
      error: 'Glot API error: 429 Too Many Requests',
    })
  })

  it('returns stdout/stderr payload on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ stdout: 'ok\n', stderr: '', error: '' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    )

    const res = await POST(req({ language: 'javascript', code: 'console.log(1)' }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ stdout: 'ok\n', stderr: '', error: '' })
  })

  it('returns 500 when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down')
    }))

    const res = await POST(req({ language: 'javascript', code: 'console.log(1)' }))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'network down' })
  })
})
