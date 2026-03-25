import { NextRequest, NextResponse } from 'next/server'

import { getRedis } from '@/app/lib/redis/client'

export const runtime = 'nodejs'

function roomKey(id: string) {
  return `room:${id}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params
  const roomId = rawId?.trim()
  const body = await request.json().catch(() => null)
  const token = typeof body?.ownerToken === 'string' ? body.ownerToken : ''

  if (!roomId) {
    return NextResponse.json({ error: 'Room ID is required' }, { status: 400 })
  }

  if (!token) {
    return NextResponse.json({ error: 'Owner token is required' }, { status: 400 })
  }

  try {
    const redis = await getRedis()
    const raw = await redis.get(roomKey(roomId))

    if (!raw) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    const room = JSON.parse(raw)
    if (room.ownerToken && room.ownerToken === token) {
      return NextResponse.json({ success: true }, { status: 200 })
    }

    return NextResponse.json({ error: 'Invalid owner token' }, { status: 403 })
  } catch (err) {
    console.error(`POST /api/rooms/${roomId}/claim-ownership failed`, err)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
