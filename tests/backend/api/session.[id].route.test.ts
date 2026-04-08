// @vitest-environment node

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock auth — controls whether user is logged in
const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ auth: authMock }))

// Mock prisma — controls DB responses
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    session: {
      update: vi.fn(),
    },
  },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { PATCH } from '@/api/session/[id]/route'

const MOCK_USER_ID = 'user-id-123'
const MOCK_SESSION_ID = 'session-id-456'
const MOCK_BODY = {
  code: 'console.log("hello")',
  language: 'javascript',
  strokes: [],
}

function req(body: object) {
  return new NextRequest(`http://localhost/api/session/${MOCK_SESSION_ID}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

function params(id = MOCK_SESSION_ID) {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/session/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.mockResolvedValue({ user: { id: MOCK_USER_ID } })
  })

  it('returns 401 when user is not authenticated', async () => {
    authMock.mockResolvedValueOnce(null)

    const res = await PATCH(req(MOCK_BODY), params())
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 200 and updates the session when authenticated', async () => {
    prismaMock.session.update.mockResolvedValueOnce({})

    const res = await PATCH(req(MOCK_BODY), params())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      message: 'Session information updated',
    })
    expect(prismaMock.session.update).toHaveBeenCalledWith({
      where: { id: MOCK_SESSION_ID },
      data: {
        code: MOCK_BODY.code,
        language: MOCK_BODY.language,
        strokes: MOCK_BODY.strokes,
      },
    })
  })

  it('returns 500 when DB throws unexpected error', async () => {
    prismaMock.session.update.mockRejectedValueOnce(new Error('DB down'))

    const res = await PATCH(req(MOCK_BODY), params())
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Internal server error' })
  })
})
