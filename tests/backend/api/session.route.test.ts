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
    userSession: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    session: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { POST } from '@/api/session/route'

const MOCK_USER_ID = 'user-id-123'
const MOCK_ROOM_ID = 'abc-def-ghi'
const MOCK_SESSION = {
  id: 'session-id-123',
  roomId: MOCK_ROOM_ID,
  name: 'Mon 9:00 AM',
  code: '',
  language: 'javascript',
  strokes: [],
  createdAt: new Date(),
  updatedAt: new Date(),
}

function req(body: object) {
  return new NextRequest('http://localhost/api/session', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: user is authenticated
    authMock.mockResolvedValue({ user: { id: MOCK_USER_ID } })
  })

  it('returns 401 when user is not authenticated', async () => {
    authMock.mockResolvedValueOnce(null)

    const res = await POST(req({ roomId: MOCK_ROOM_ID }))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 200 with existing session when UserSession already exists', async () => {
    prismaMock.userSession.findFirst.mockResolvedValueOnce({
      id: 'user-session-id',
      session: MOCK_SESSION,
    })

    const res = await POST(req({ roomId: MOCK_ROOM_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.message).toBe('UserSession already exists')
    expect(body.session.id).toBe(MOCK_SESSION.id)
  })

  it('returns 201 and creates UserSession when Session exists but user is new', async () => {
    prismaMock.userSession.findFirst.mockResolvedValueOnce(null)
    prismaMock.session.findFirst.mockResolvedValueOnce(MOCK_SESSION)
    prismaMock.userSession.create.mockResolvedValueOnce({ id: 'new-user-session-id' })

    const res = await POST(req({ roomId: MOCK_ROOM_ID }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.message).toBe('Created UserSession for existing Session')
    expect(body.session.id).toBe(MOCK_SESSION.id)
    expect(prismaMock.userSession.create).toHaveBeenCalledWith({
      data: { userId: MOCK_USER_ID, sessionId: MOCK_SESSION.id, isOwner: false },
    })
  })

  it('returns 201 and creates Session + UserSession when neither exists', async () => {
    prismaMock.userSession.findFirst.mockResolvedValueOnce(null)
    prismaMock.session.findFirst.mockResolvedValueOnce(null)
    prismaMock.session.create.mockResolvedValueOnce(MOCK_SESSION)
    prismaMock.userSession.create.mockResolvedValueOnce({ id: 'new-user-session-id' })

    const res = await POST(req({
      roomId: MOCK_ROOM_ID,
      code: '',
      language: 'javascript',
      strokes: [],
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.message).toBe('Created new Session and UserSession')
    expect(body.session.id).toBe(MOCK_SESSION.id)
    expect(prismaMock.session.create).toHaveBeenCalled()
    expect(prismaMock.userSession.create).toHaveBeenCalledWith({
      data: { userId: MOCK_USER_ID, sessionId: MOCK_SESSION.id, isOwner: true },
    })
  })

  it('returns 500 when DB throws unexpected error', async () => {
    prismaMock.userSession.findFirst.mockRejectedValueOnce(new Error('DB down'))

    const res = await POST(req({ roomId: MOCK_ROOM_ID }))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Internal server error' })
  })
})
