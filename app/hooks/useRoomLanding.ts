'use client'
import { useEffect, useState } from 'react'

import { addToast } from '@heroui/toast'
import { useRouter, useSearchParams } from 'next/navigation'

import type { RoomEntryStep } from '@/app/interfaces/types'
import { generateRandomUserName } from '@/app/utils/randomName'
import { formatRoomCodeInput, normalizeRoomCode } from '@/app/utils/roomCode'

function readErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const error = (value as { error?: unknown }).error
  return typeof error === 'string' ? error : null
}

function readRoom(value: unknown): { id: string; ownerToken?: string } | null {
  if (!value || typeof value !== 'object') return null
  const room = (value as { room?: unknown }).room
  if (!room || typeof room !== 'object') return null
  const id = (room as { id?: unknown }).id
  if (typeof id !== 'string' || !id) return null
  const ownerToken = (room as { ownerToken?: unknown }).ownerToken
  if (typeof ownerToken === 'string') {
    return { id, ownerToken }
  }
  return { id }
}

export function useRoomLanding() {
  const [joinRoomId, setJoinRoomId] = useState('')
  const [userName, setUserName] = useState('')
  const [step, setStep] = useState<RoomEntryStep>('initial')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const storedUserName = sessionStorage.getItem('codelink:userName')
    if (storedUserName) {
      setUserName(storedUserName)
    } else {
      setUserName(generateRandomUserName())
    }
    const joinId = searchParams?.get('join')
    if (joinId) {
      setJoinRoomId(formatRoomCodeInput(joinId))
      if (!storedUserName) {
        setStep('join-name')
      }
    }
  }, [searchParams])

  const handleJoinRoom = () => {
    setIsSubmitting(true)
    const name = userName.trim()
    const normalized = normalizeRoomCode(joinRoomId)
    if (!name) {
      addToast({
        title: 'Name required',
        description: 'Please enter your name to join the room.',
        color: 'warning',
        variant: 'solid',
        timeout: 4000,
      })
      setIsSubmitting(false)
      return
    }
    if (!normalized) {
      addToast({
        title: 'Invalid room code',
        description: 'Please use format XXX-XXX-XXX.',
        color: 'danger',
        variant: 'solid',
        timeout: 4000,
      })
      setIsSubmitting(false)
      return
    }
    sessionStorage.setItem('codelink:userName', name)
    router.push(`/rooms/${normalized}`)
  }

  const handleCreateRoom = async () => {
    setIsSubmitting(true)
    const name = userName.trim()
    if (!name) {
      addToast({
        title: 'Name required',
        description: 'Please enter your name to create a room.',
        color: 'warning',
        variant: 'solid',
        timeout: 4000,
      })
      setIsSubmitting(false)
      return
    }
    sessionStorage.setItem('codelink:userName', name)

    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No id => server generates + reserves a unique code.
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        addToast({
          title: 'Failed to create room',
          description: readErrorMessage(body) || 'Please try again.',
          color: 'danger',
          variant: 'solid',
          timeout: 5000,
        })
        setIsSubmitting(false)
        return
      }

      const body = await response.json()
      const room = readRoom(body)
      if (room?.id) {
        if (room.ownerToken) {
          sessionStorage.setItem(
            `codelink:ownerToken:${room.id}`,
            room.ownerToken
          )
        }
        router.push(`/rooms/${room.id}`)
      } else {
        addToast({
          title: 'Error creating room',
          description: 'Invalid response from server. Please try again.',
          color: 'danger',
          variant: 'solid',
          timeout: 5000,
        })
        setIsSubmitting(false)
      }
    } catch (err) {
      console.error('Room creation failed', err)
      addToast({
        title: 'Network error',
        description: 'Please try again.',
        color: 'danger',
        variant: 'solid',
        timeout: 5000,
      })
      setIsSubmitting(false)
    }
  }

  const isExistingRoom = async (id: string) => {
    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/rooms?id=${id}`)
      if (!response.ok) return false
      const data = await response.json()
      return !!data.room
    } catch (error) {
      console.error('Error checking room existence:', error)
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    joinRoomId,
    setJoinRoomId,
    userName,
    setUserName,
    step,
    setStep,
    handleJoinRoom,
    handleCreateRoom,
    isSubmitting,
    isExistingRoom,
  } as const
}
