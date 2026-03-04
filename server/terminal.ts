import type { Server, Socket } from 'socket.io'

const ROOM_ID_RE = /^[a-z]{3}-[a-z]{3}-[a-z]{3}$/

type JoinOptions = {
  cols?: number
  rows?: number
}

type RoomTerminal = {
  roomId: string
  buffer: string
  clients: Set<string>
  cleanupTimer: NodeJS.Timeout | null
}

function safeRoomId(roomId: unknown): string | null {
  if (typeof roomId !== 'string') return null
  const trimmed = roomId.trim()
  return ROOM_ID_RE.test(trimmed) ? trimmed : null
}

export class TerminalManager {
  private readonly io: Server
  private readonly sessions = new Map<string, RoomTerminal>()

  // Keep the last N chars for late joiners.
  private readonly maxBufferChars = 64_000

  // If a room has no viewers, clean up after this delay.
  private readonly idleKillMs = 30_000

  constructor(io: Server) {
    this.io = io
  }

  join(socket: Socket, roomIdRaw: unknown, options?: JoinOptions) {
    const roomId = safeRoomId(roomIdRaw)
    if (!roomId) {
      socket.emit('terminal:error', { error: 'Invalid room id' })
      return
    }

    socket.join(roomId)

    const session = this.getOrCreate(roomId, options)
    session.clients.add(socket.id)

    // Cancel pending cleanup if someone re-joins.
    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer)
      session.cleanupTimer = null
    }

    // Send buffered output so the terminal isn't blank for late joiners.
    if (session.buffer) {
      socket.emit('terminal:data', session.buffer)
    }
  }

  leave(socket: Socket, roomIdRaw: unknown) {
    const roomId = safeRoomId(roomIdRaw)
    if (!roomId) return

    socket.leave(roomId)
    const session = this.sessions.get(roomId)
    if (!session) return

    session.clients.delete(socket.id)

    this.maybeScheduleCleanup(session)
  }

  onDisconnect(socket: Socket) {
    for (const session of this.sessions.values()) {
      if (!session.clients.has(socket.id)) continue

      session.clients.delete(socket.id)

      this.maybeScheduleCleanup(session)
    }
  }

  resize(socket: Socket, roomIdRaw: unknown, size: unknown) {
    const roomId = safeRoomId(roomIdRaw)
    if (!roomId) return

    const session = this.sessions.get(roomId)
    if (!session) return
    // No-op: we don't run a PTY anymore.
    void size
  }

  /** Write data to all clients in a room and buffer it for late joiners. */
  writeToRoom(roomId: string, data: string) {
    const session = this.sessions.get(roomId)
    if (session) {
      session.buffer += data
      if (session.buffer.length > this.maxBufferChars) {
        session.buffer = session.buffer.slice(session.buffer.length - this.maxBufferChars)
      }
    }
    this.io.to(roomId).emit('terminal:data', data)
  }

  private getOrCreate(roomId: string, options?: JoinOptions) {
    const existing = this.sessions.get(roomId)
    if (existing) return existing

    void options

    const session: RoomTerminal = {
      roomId,
      buffer: '',
      clients: new Set(),
      cleanupTimer: null,
    }

    this.sessions.set(roomId, session)
    return session
  }

  private maybeScheduleCleanup(session: RoomTerminal) {
    if (session.clients.size > 0) return
    if (session.cleanupTimer) return

    session.cleanupTimer = setTimeout(() => {
      if (session.clients.size === 0) {
        this.dispose(session.roomId)
      }
    }, this.idleKillMs)
  }

  private dispose(roomId: string) {
    const session = this.sessions.get(roomId)
    if (!session) return

    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer)
    }

    this.sessions.delete(roomId)
  }
}
