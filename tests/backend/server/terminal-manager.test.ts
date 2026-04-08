// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import { TerminalManager } from '../../../server/terminal'

function makeIoMock() {
  const emit = vi.fn()
  const except = vi.fn(() => ({ emit }))
  const to = vi.fn(() => ({ emit, except }))
  return { io: { to }, to, emit, except }
}

function makeSocket(id = 'sock-1') {
  return {
    id,
    emit: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
  }
}

describe('TerminalManager', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits terminal:error for invalid room id', () => {
    const { io } = makeIoMock()
    const manager = new TerminalManager(io as never)
    const socket = makeSocket('s1')

    manager.join(socket as never, 'invalid-room')

    expect(socket.emit).toHaveBeenCalledWith('terminal:error', {
      error: 'Invalid room id',
    })
    expect(socket.join).not.toHaveBeenCalled()
  })

  it('buffers data and replays it to late joiners', () => {
    const { io } = makeIoMock()
    const manager = new TerminalManager(io as never)

    const driver = makeSocket('driver')
    const lateJoiner = makeSocket('nav')

    manager.join(driver as never, 'abc-def-ghi')
    manager.writeToRoom('abc-def-ghi', 'hello from driver\n')

    manager.join(lateJoiner as never, 'abc-def-ghi')

    expect(lateJoiner.emit).toHaveBeenCalledWith(
      'terminal:data',
      expect.stringContaining('hello from driver')
    )
  })

  it('relays with except when sender should be excluded', () => {
    const { io, to, except, emit } = makeIoMock()
    const manager = new TerminalManager(io as never)

    manager.writeToRoom('abc-def-ghi', 'payload', 'sender-id')

    expect(to).toHaveBeenCalledWith('abc-def-ghi')
    expect(except).toHaveBeenCalledWith('sender-id')
    expect(emit).toHaveBeenCalledWith('terminal:data', 'payload')
  })

  it('cleans up session buffer after all clients leave and idle timeout passes', () => {
    vi.useFakeTimers()
    const { io } = makeIoMock()
    const manager = new TerminalManager(io as never)
    const socket = makeSocket('s1')
    const lateJoiner = makeSocket('s2')

    manager.join(socket as never, 'abc-def-ghi')
    manager.writeToRoom('abc-def-ghi', 'buffered\n')
    manager.leave(socket as never, 'abc-def-ghi')

    vi.advanceTimersByTime(30_001)

    manager.join(lateJoiner as never, 'abc-def-ghi')
    expect(lateJoiner.emit).not.toHaveBeenCalledWith(
      'terminal:data',
      expect.stringContaining('buffered')
    )
  })

  it('cleans up on disconnect and handles resize/leave no-op paths', () => {
    vi.useFakeTimers()
    const { io } = makeIoMock()
    const manager = new TerminalManager(io as never)
    const socket = makeSocket('s3')
    const lateJoiner = makeSocket('s4')

    manager.join(socket as never, 'abc-def-ghi')
    manager.writeToRoom('abc-def-ghi', 'first\n')
    manager.resize(socket as never, 'abc-def-ghi', { cols: 80, rows: 24 })
    manager.resize(socket as never, 'bad-room', { cols: 80, rows: 24 })
    manager.leave(socket as never, 'bad-room')

    manager.onDisconnect(socket as never)
    vi.advanceTimersByTime(30_001)

    manager.join(lateJoiner as never, 'abc-def-ghi')
    expect(lateJoiner.emit).not.toHaveBeenCalledWith(
      'terminal:data',
      expect.stringContaining('first')
    )
  })
})
