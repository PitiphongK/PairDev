'use client'

import { useEffect, useState } from 'react'

import { Button, Form, Input, Spinner } from '@heroui/react'
import { addToast } from '@heroui/toast'
import { useRouter, useSearchParams } from 'next/navigation'

import { useRoomLanding } from '@/hooks/useRoomLanding'
import type { RoomEntryStep } from '@/interfaces/types'
import { generateRandomUserName } from '@/utils/randomName'
import { formatRoomCodeInput, normalizeRoomCode } from '@/utils/roomCode'

import { Logo } from './Logo'
import SessionSummaryModal from './modals/SessionSummaryModal'

export default function HomeClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [summaryData, setSummaryData] = useState<{
    summary: { sessionMs: number; driverMs: number; navigatorMs: number; noneMs: number }
    users: Array<{ clientId: number; name: string; driverMs: number; navigatorMs: number; noneMs: number }>
  } | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('codelink:session-summary')
    if (!raw) return
    sessionStorage.removeItem('codelink:session-summary')
    try {
      setSummaryData(JSON.parse(raw))
    } catch { }
  }, [])

  useEffect(() => {
    const raw = sessionStorage.getItem('codelink:pending-toast')
    if (!raw) return
    sessionStorage.removeItem('codelink:pending-toast')
    try {
      const payload = JSON.parse(raw)
      addToast(payload)
    } catch { }
  }, [])

  useEffect(() => {
    const error = searchParams?.get('error')
    if (!error) return

    if (error === 'room-not-found') {
      addToast({
        title: 'Room not found',
        description: 'This room doesn’t exist (or was deleted).',
        color: 'danger',
        variant: 'solid',
        timeout: 4000,
      })
    } else if (error === 'invalid-room-code') {
      addToast({
        title: 'Invalid room code',
        description: 'Please check the code and try again.',
        color: 'danger',
        variant: 'solid',
        timeout: 4000,
      })
    }

    // Remove the error param so refresh/back doesn't re-toast.
    const next = new URLSearchParams(searchParams.toString())
    next.delete('error')
    const nextQuery = next.toString()
    router.replace(nextQuery ? `/?${nextQuery}` : '/')
  }, [router, searchParams])

  const {
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
  } = useRoomLanding()

  const renderInitial = () => (
    <>
      <div className="flex flex-col sm:flex-row gap-4 w-full">
        {/* Join Section */}
        <div className="flex flex-col items-start p-6 w-full sm:w-1/2 rounded-lg">
          <h2 className="text-xl font-semibold mb-1">Join a room</h2>
          <p className="text-sm font-medium mb-4 text-gray-500">
            Join an existing session
          </p>

          <Form
            className="w-full"
            onSubmit={async (e) => {
              e.preventDefault()
              const normalized = normalizeRoomCode(joinRoomId)
              if (!normalized) {
                addToast({
                  title: 'Invalid room code',
                  description: 'Please use format XXX-XXX-XXX.',
                  color: 'danger',
                  variant: 'solid',
                  timeout: 4000,
                })
                return
              }
              if (await isExistingRoom(normalized))
                setStep('join-name' as RoomEntryStep)
              else {
                addToast({
                  title: 'Room not found',
                  description:
                    'Check the code or ask the host to create it first.',
                  color: 'danger',
                  variant: 'solid',
                  timeout: 4000,
                })
              }
            }}
          >
            <Input
              isRequired
              errorMessage="Please enter a valid room code."
              placeholder="abc-def-ghi"
              size="lg"
              type="text"
              className="mb-4 w-full"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(formatRoomCodeInput(e.target.value))}
            />
            <Button
              color="primary"
              type="submit"
              disabled={isSubmitting || !joinRoomId.trim()}
              className="w-full"
            >
              {isSubmitting ? (
                <Spinner color="default" variant="simple" size="sm" />
              ) : (
                'Join'
              )}
            </Button>
          </Form>
        </div>

        {/* Create Section */}
        <div className="flex flex-col items-start p-6 w-full sm:w-1/2 rounded-lg">
          <h2 className="text-xl font-semibold mb-1">Create a room</h2>
          <p className="text-sm font-medium mb-4 text-gray-500">
            Start a new session
          </p>
          <Button
            color="default"
            onPress={() => {
              if (!userName.trim()) setUserName(generateRandomUserName())
              setStep('create-name')
            }}
            className="w-full"
          >
            Create
          </Button>
        </div>
      </div>
    </>
  )

  const renderNameStep = (isJoining: boolean) => (
    <div className="flex flex-col items-start px-4 w-full max-w-sm">
      <form
        className="w-full"
        onSubmit={(e) => {
          e.preventDefault()
            ; (isJoining ? handleJoinRoom : handleCreateRoom)()
        }}
      >
        <h2 className="text-2xl font-semibold mb-1">What&apos;s your name?</h2>
        <p className="text-sm font-medium mb-5 text-gray-500">
          This will be your display name in the session.
        </p>
        <Input
          placeholder="Enter your name"
          size="lg"
          type="text"
          className="mb-4"
          value={userName}
          maxLength={50}
          onChange={(e) => setUserName(e.target.value.slice(0, 50))}
          description={userName.length >= 40 ? `${50 - userName.length} characters remaining` : undefined}
          autoFocus
        />
        <Button
          color="primary"
          type="submit"
          className="w-30"
          disabled={isSubmitting || !userName.trim()}
        >
          {isSubmitting ? (
            <Spinner color="default" variant="simple" size="sm" />
          ) : isJoining ? (
            'Enter Room'
          ) : (
            'Create Room'
          )}
        </Button>
      </form>
    </div>
  )

  return (
    <main>
      <SessionSummaryModal
        isOpen={summaryData !== null}
        onClose={() => setSummaryData(null)}
        summary={summaryData?.summary ?? null}
        users={summaryData?.users}
        primaryActionLabel="Close"
      />
      <div className="min-h-screen flex flex-col items-center py-8 px-4">
        <div className="mb-20 text-2xl flex justify-center">
          <Logo className="w-64 h-auto text-gray-900 dark:text-white" />
        </div>

        <div className="flex items-start justify-center w-full max-w-4xl">
          {step === 'initial' && renderInitial()}
          {step === 'join-name' && renderNameStep(true)}
          {step === 'create-name' && renderNameStep(false)}
        </div>
      </div>
    </main>
  )
}
