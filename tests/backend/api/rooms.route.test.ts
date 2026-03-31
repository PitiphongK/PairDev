// @vitest-environment node

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { redisMock } = vi.hoisted(() => ({
  redisMock: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}))

vi.mock('@/app/lib/redis/client', () => ({
  getRedis: vi.fn(async () => redisMock),
}))

import { DELETE, GET, POST } from '@/app/api/rooms/route'

function req(url: string, init?: RequestInit) {
  return new NextRequest(url, init)
}

describe('app/api/rooms/route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns 400 when id is missing', async () => {
    const res = await GET(req('http://localhost/api/rooms'))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Room ID is required' })
  })

  it('GET returns 404 when room does not exist', async () => {
    redisMock.get.mockResolvedValueOnce(null)

    const res = await GET(req('http://localhost/api/rooms?id=abc-def-ghi'))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Room not found' })
  })

  it('GET returns room payload when room exists', async () => {
    redisMock.get.mockResolvedValueOnce(
      JSON.stringify({ id: 'abc-def-ghi', createdAt: '2026-01-01T00:00:00.000Z' })
    )

    const res = await GET(req('http://localhost/api/rooms?id=abc-def-ghi'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      room: { id: 'abc-def-ghi', createdAt: '2026-01-01T00:00:00.000Z' },
    })
  })

  it('GET returns 500 when redis throws', async () => {
    redisMock.get.mockRejectedValueOnce(new Error('boom'))

    const res = await GET(req('http://localhost/api/rooms?id=abc-def-ghi'))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Internal Server Error' })
  })

  it('POST returns 400 for invalid requested room code', async () => {
    const res = await POST(
      req('http://localhost/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ id: 'INVALID' }),
      })
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid room code' })
  })

  it('POST returns 409 when requested room already exists', async () => {
    redisMock.set.mockResolvedValueOnce(null)

    const res = await POST(
      req('http://localhost/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ id: 'abc-def-ghi' }),
      })
    )

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'Room already exists' })
  })

  it('POST creates requested room with NX set', async () => {
    redisMock.set.mockResolvedValueOnce('OK')

    const res = await POST(
      req('http://localhost/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ id: 'abc-def-ghi' }),
      })
    )

    expect(res.status).toBe(201)
    expect(redisMock.set).toHaveBeenCalledWith(
      'room:abc-def-ghi',
      expect.any(String),
      { NX: true }
    )

    const body = await res.json()
    expect(body.room.id).toBe('abc-def-ghi')
  })

  it('POST creates generated room when no id provided', async () => {
    redisMock.set.mockResolvedValueOnce('OK')

    const res = await POST(
      req('http://localhost/api/rooms', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    )

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.room.id).toMatch(/^[a-z]{3}-[a-z]{3}-[a-z]{3}$/)
  })

  it('POST returns 503 when generated ids cannot be reserved', async () => {
    redisMock.set.mockResolvedValue(null)

    const res = await POST(
      req('http://localhost/api/rooms', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    )

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({
      error: 'Could not allocate a room code. Please try again.',
    })
  })

  it('POST returns 500 when redis errors', async () => {
    redisMock.set.mockRejectedValueOnce(new Error('set failed'))

    const res = await POST(
      req('http://localhost/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ id: 'abc-def-ghi' }),
      })
    )

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Internal Server Error' })
  })

  it('DELETE returns 400 when id is missing', async () => {
    const res = await DELETE(req('http://localhost/api/rooms', { method: 'DELETE' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Room ID is required' })
  })

  it('DELETE returns 404 when room does not exist', async () => {
    redisMock.del.mockResolvedValueOnce(0)

    const res = await DELETE(req('http://localhost/api/rooms?id=abc-def-ghi', { method: 'DELETE' }))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Room not found' })
  })

  it('DELETE returns 200 when room is deleted', async () => {
    redisMock.del.mockResolvedValueOnce(1)

    const res = await DELETE(req('http://localhost/api/rooms?id=abc-def-ghi', { method: 'DELETE' }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      message: 'Room deleted successfully',
    })
  })

  it('DELETE returns 500 when redis throws', async () => {
    redisMock.del.mockRejectedValueOnce(new Error('del failed'))

    const res = await DELETE(req('http://localhost/api/rooms?id=abc-def-ghi', { method: 'DELETE' }))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Internal Server Error' })
  })
})
