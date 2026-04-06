import { notFound, redirect } from 'next/navigation'

import { getRedis } from '@/lib/redis/client'
import { isValidRoomCode } from '@/utils/roomCode'

import RoomPageClient from './RoomPageClient'

export const runtime = 'nodejs'

function roomKey(id: string) {
  return `room:${id}`
}

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: rawId } = await params
  const id = rawId?.trim()
  if (!id) notFound()

  // Keep this consistent with the existing client-side validation.
  if (!isValidRoomCode(id)) {
    redirect('/?error=invalid-room-code')
  }

  const redis = await getRedis()
  const raw = await redis.get(roomKey(id))

  // Room doesn't exist -> redirect before rendering UI
  if (!raw) {
    redirect('/?error=room-not-found')
  }

  return <RoomPageClient id={id} />
}
