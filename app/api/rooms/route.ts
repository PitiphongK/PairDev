import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

import { getRedis } from '@/app/lib/redis/client'
import { generateRoomCode, isValidRoomCode } from '@/app/utils/roomCode'

export const runtime = 'nodejs'

type Room = {
  id: string
  createdAt: string
  ownerToken?: string
}

function roomKey(id: string) {
  return `room:${id}`
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id)
    return NextResponse.json({ error: 'Room ID is required' }, { status: 400 })

  try {
    const redis = await getRedis()
    const raw = await redis.get(roomKey(id))
    if (!raw)
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })

    const room = JSON.parse(raw) as Room
    return NextResponse.json({ room })
  } catch (err) {
    console.error('GET /api/rooms failed', err)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const redis = await getRedis()

    const requestedId = typeof body?.id === 'string' ? body.id.trim() : ''

    // If the client provides an id, validate and attempt to create it.
    if (requestedId) {
      if (!isValidRoomCode(requestedId)) {
        return NextResponse.json(
          { error: 'Invalid room code' },
          { status: 400 }
        )
      }

      const ownerToken = crypto.randomBytes(16).toString('hex')
      const newRoom: Room = {
        id: requestedId,
        createdAt: new Date().toISOString(),
        ownerToken,
      }
      const created = await redis.set(
        roomKey(requestedId),
        JSON.stringify(newRoom),
        { NX: true }
      )
      if (created !== 'OK')
        return NextResponse.json(
          { error: 'Room already exists' },
          { status: 409 }
        )
      return NextResponse.json({ room: newRoom }, { status: 201 })
    }

    // Otherwise, generate server-side and reserve atomically.
    const maxAttempts = 16
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const id = generateRoomCode()
      const ownerToken = crypto.randomBytes(16).toString('hex')
      const newRoom: Room = { id, createdAt: new Date().toISOString(), ownerToken }
      const created = await redis.set(roomKey(id), JSON.stringify(newRoom), {
        NX: true,
      })
      if (created === 'OK')
        return NextResponse.json({ room: newRoom }, { status: 201 })
    }

    return NextResponse.json(
      { error: 'Could not allocate a room code. Please try again.' },
      { status: 503 }
    )
  } catch (err) {
    console.error('POST /api/rooms failed', err)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id)
    return NextResponse.json({ error: 'Room ID is required' }, { status: 400 })

  try {
    const redis = await getRedis()
    const deleted = await redis.del(roomKey(id))
    if (deleted === 0)
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    return NextResponse.json(
      { message: 'Room deleted successfully' },
      { status: 200 }
    )
  } catch (err) {
    console.error('DELETE /api/rooms failed', err)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
