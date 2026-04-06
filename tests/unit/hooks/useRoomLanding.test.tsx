import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, beforeEach, vi } from 'vitest'

const {
  mockPush,
  mockGet,
  mockSearchParams,
  mockAddToast,
  mockGenerateRandomUserName,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockGet: vi.fn<(key: string) => string | null>(),
  mockSearchParams: { get: vi.fn<(key: string) => string | null>() },
  mockAddToast: vi.fn(),
  mockGenerateRandomUserName: vi.fn(() => 'Random User'),
}))

mockSearchParams.get = mockGet

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}))

vi.mock('@heroui/toast', () => ({
  addToast: mockAddToast,
}))

vi.mock('@/app/utils/randomName', () => ({
  generateRandomUserName: mockGenerateRandomUserName,
}))

import { useRoomLanding } from '@/hooks/useRoomLanding'

describe('useRoomLanding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mockGet.mockReturnValue(null)
    vi.stubGlobal('fetch', vi.fn())
  })

  it('prefills generated user name when storage is empty', async () => {
    const { result } = renderHook(() => useRoomLanding())

    await waitFor(() => {
      expect(result.current.userName).toBe('Random User')
    })
    expect(result.current.step).toBe('initial')
  })

  it('switches to join-name step when join param exists and no stored name', async () => {
    mockGet.mockReturnValue('abcdefghi')

    const { result } = renderHook(() => useRoomLanding())

    await waitFor(() => {
      expect(result.current.joinRoomId).toBe('abc-def-ghi')
      expect(result.current.step).toBe('join-name')
    })
  })

  it('joins room for valid name and room code', async () => {
    const { result } = renderHook(() => useRoomLanding())

    await waitFor(() => expect(result.current.userName).toBe('Random User'))

    act(() => result.current.setUserName('Alice'))
    act(() => result.current.setJoinRoomId('abc-def-ghi'))
    await waitFor(() => {
      expect(result.current.userName).toBe('Alice')
      expect(result.current.joinRoomId).toBe('abc-def-ghi')
    })
    act(() => result.current.handleJoinRoom())

    expect(sessionStorage.getItem('codelink:userName')).toBe('Alice')
    expect(mockPush).toHaveBeenCalledWith('/rooms/abc-def-ghi')
    expect(mockAddToast).not.toHaveBeenCalled()
  })

  it('shows warning toast when join name is empty', async () => {
    const { result } = renderHook(() => useRoomLanding())

    await waitFor(() => expect(result.current.userName).toBe('Random User'))

    act(() => result.current.setUserName('   '))
    act(() => result.current.setJoinRoomId('abc-def-ghi'))
    await waitFor(() => {
      expect(result.current.userName).toBe('   ')
      expect(result.current.joinRoomId).toBe('abc-def-ghi')
    })
    act(() => result.current.handleJoinRoom())

    expect(mockPush).not.toHaveBeenCalled()
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Name required' })
    )
  })

  it('shows invalid room code toast when join room id is malformed', async () => {
    const { result } = renderHook(() => useRoomLanding())

    await waitFor(() => expect(result.current.userName).toBe('Random User'))
    act(() => result.current.setUserName('Alice'))
    act(() => result.current.setJoinRoomId('bad'))
    act(() => result.current.handleJoinRoom())

    expect(mockPush).not.toHaveBeenCalled()
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Invalid room code' })
    )
  })

  it('shows warning when creating room with empty name', async () => {
    const { result } = renderHook(() => useRoomLanding())

    act(() => result.current.setUserName('   '))
    await act(async () => {
      await result.current.handleCreateRoom()
    })

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Name required' })
    )
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('creates room and routes on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ room: { id: 'abc-def-ghi' } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useRoomLanding())

    act(() => result.current.setUserName('Creator'))

    await act(async () => {
      await result.current.handleCreateRoom()
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/rooms',
      expect.objectContaining({ method: 'POST' })
    )
    expect(mockPush).toHaveBeenCalledWith('/rooms/abc-def-ghi')
  })

  it('shows server message when create room request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Backend unavailable' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useRoomLanding())
    act(() => result.current.setUserName('Creator'))

    await act(async () => {
      await result.current.handleCreateRoom()
    })

    expect(mockPush).not.toHaveBeenCalled()
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Failed to create room',
        description: 'Backend unavailable',
      })
    )
  })

  it('shows fallback error when create room response lacks room id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ room: {} }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useRoomLanding())
    act(() => result.current.setUserName('Creator'))

    await act(async () => {
      await result.current.handleCreateRoom()
    })

    expect(mockPush).not.toHaveBeenCalled()
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Error creating room',
      })
    )
  })

  it('shows network error toast when create room throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useRoomLanding())
    act(() => result.current.setUserName('Creator'))

    await act(async () => {
      await result.current.handleCreateRoom()
    })

    expect(mockPush).not.toHaveBeenCalled()
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Network error' })
    )
  })

  it('returns false for non-existing room and true for existing room', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ room: { id: 'a' } }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useRoomLanding())

    let exists = false
    let missing = true

    await act(async () => {
      exists = await result.current.isExistingRoom('abc-def-ghi')
    })
    await act(async () => {
      missing = await result.current.isExistingRoom('zzz-yyy-xxx')
    })

    expect(exists).toBe(true)
    expect(missing).toBe(false)
  })

  it('returns false when room-existence check throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('boom'))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useRoomLanding())

    let exists = true
    await act(async () => {
      exists = await result.current.isExistingRoom('abc-def-ghi')
    })

    expect(exists).toBe(false)
  })
})
