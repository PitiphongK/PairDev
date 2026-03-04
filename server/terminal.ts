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
  abortController: AbortController | null
}

function safeRoomId(roomId: unknown): string | null {
  if (typeof roomId !== 'string') return null
  const trimmed = roomId.trim()
  return ROOM_ID_RE.test(trimmed) ? trimmed : null
}

// Piston runtime slugs — get current versions via:
// GET https://emkc.org/api/v2/piston/runtimes
const PISTON_LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
  python:     { language: 'python',     version: '3.10.0' },
  javascript: { language: 'javascript', version: '18.15.0' },
  typescript: { language: 'typescript', version: '5.0.3' },
  java:       { language: 'java',       version: '15.0.2' },
  c:          { language: 'c',          version: '10.2.0' },
  cpp:        { language: 'c++',        version: '10.2.0' },
  csharp:     { language: 'csharp',     version: '6.12.0' },
  go:         { language: 'go',         version: '1.16.2' },
  rust:       { language: 'rust',       version: '1.50.0' },
  ruby:       { language: 'ruby',       version: '3.0.1' },
  php:        { language: 'php',        version: '8.2.3' },
  bash:       { language: 'bash',       version: '5.2.0' },
}

export class TerminalManager {
  private readonly io: Server
  private readonly sessions = new Map<string, RoomTerminal>()
  private readonly pistonUrl: string

  // Keep the last N chars for late joiners.
  private readonly maxBufferChars = 64_000

  // If a room has no viewers, clean up after this delay.
  private readonly idleKillMs = 30_000

  // Abort Piston request after this duration.
  private readonly runTimeoutMs = 30_000

  constructor(io: Server) {
    this.io = io
    this.pistonUrl = process.env.PISTON_API_URL ?? 'https://emkc.org/api/v2/piston'
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

  async run(socket: Socket, payload: unknown) {
    const payloadObj: Record<string, unknown> =
      payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>)
        : {}

    const roomId = safeRoomId(payloadObj.roomId)
    if (!roomId) {
      socket.emit('terminal:error', { error: 'Invalid room id' })
      return
    }

    const session = this.getOrCreate(roomId)

    const rawLanguage = payloadObj.language
    const language = this.normalizeLanguage(rawLanguage)
    if (!language) {
      socket.emit('terminal:error', { error: 'Unsupported language' })
      return
    }

    const code = typeof payloadObj.code === 'string' ? payloadObj.code : ''
    if (!code.trim()) {
      socket.emit('terminal:error', { error: 'No code provided' })
      return
    }

    if (code.length > 200_000) {
      socket.emit('terminal:error', { error: 'Code too large' })
      return
    }

    // Cancel pending cleanup while a run is in progress.
    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer)
      session.cleanupTimer = null
    }

    // Abort any prior in-flight Piston request for this room.
    session.abortController?.abort()

    // Clear buffer and clear everyone’s screen.
    session.buffer = ''
    this.io.to(roomId).emit('terminal:data', '\x1bc\x1b[2J\x1b[H')

    const pistonLang = PISTON_LANGUAGE_MAP[language]
    if (!pistonLang) {
      socket.emit('terminal:error', { error: `No sandbox runtime for: ${language}` })
      this.maybeScheduleCleanup(session)
      return
    }

    this.emit(roomId, `Running ${language}...\r\n`)

    const ac = new AbortController()
    session.abortController = ac
    const timeout = setTimeout(() => ac.abort('timeout'), this.runTimeoutMs)

    try {
      const res = await fetch(`${this.pistonUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: pistonLang.language,
          version: pistonLang.version,
          files: [{ name: 'main', content: code }],
        }),
        signal: ac.signal,
      })

      clearTimeout(timeout)
      session.abortController = null

      if (!res.ok) {
        this.emit(roomId, `\r\n[Piston API error: ${res.status} ${res.statusText}]\r\n`)
        this.io.to(roomId).emit('terminal:exit', { exitCode: 1 })
        this.maybeScheduleCleanup(session)
        return
      }

      const data = await res.json() as {
        compile?: { stdout: string; stderr: string; code: number | null }
        run: { stdout: string; stderr: string; code: number | null }
      }

      // Compiled languages (Java, C, C++, Rust, Go, C#, TS) show compile output first.
      if (data.compile) {
        if (data.compile.stdout) this.emitBuffered(session, roomId, data.compile.stdout)
        if (data.compile.stderr) this.emitBuffered(session, roomId, data.compile.stderr)
        if (data.compile.code !== 0 && data.compile.code != null) {
          this.io.to(roomId).emit('terminal:exit', { exitCode: data.compile.code })
          this.maybeScheduleCleanup(session)
          return
        }
      }

      if (data.run.stdout) this.emitBuffered(session, roomId, data.run.stdout)
      if (data.run.stderr) this.emitBuffered(session, roomId, data.run.stderr)

      this.io.to(roomId).emit('terminal:exit', { exitCode: data.run.code ?? 0 })
    } catch (err: unknown) {
      clearTimeout(timeout)
      session.abortController = null
      const isTimeout = ac.signal.aborted && ac.signal.reason === 'timeout'
      if (isTimeout) {
        this.emit(roomId, `\r\n[timed out after ${Math.round(this.runTimeoutMs / 1000)}s]\r\n`)
        this.io.to(roomId).emit('terminal:exit', { exitCode: -1 })
      } else {
        const message = err instanceof Error ? err.message : String(err)
        socket.emit('terminal:error', { error: message })
      }
    } finally {
      this.maybeScheduleCleanup(session)
    }
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
      abortController: null,
    }

    this.sessions.set(roomId, session)
    return session
  }

  private normalizeLanguage(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const v = value.trim().toLowerCase()
    if (v === 'py' || v === 'python') return 'python'
    if (v === 'js' || v === 'javascript') return 'javascript'
    if (v === 'ts' || v === 'typescript') return 'typescript'
    if (v === 'java') return 'java'
    if (v === 'c') return 'c'
    if (v === 'cpp' || v === 'c++') return 'cpp'
    if (v === 'cs' || v === 'csharp' || v === 'c#') return 'csharp'
    if (v === 'go' || v === 'golang') return 'go'
    if (v === 'rs' || v === 'rust') return 'rust'
    if (v === 'rb' || v === 'ruby') return 'ruby'
    if (v === 'php') return 'php'
    if (v === 'sh' || v === 'bash' || v === 'shell') return 'bash'
    return null
  }

  private emit(roomId: string, data: string) {
    this.io.to(roomId).emit('terminal:data', data)
  }

  /** Emit text and append to the late-joiner buffer. */
  private emitBuffered(session: RoomTerminal, roomId: string, text: string) {
    session.buffer += text
    if (session.buffer.length > this.maxBufferChars) {
      session.buffer = session.buffer.slice(session.buffer.length - this.maxBufferChars)
    }
    this.io.to(roomId).emit('terminal:data', text)
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

    // Abort any in-flight Piston request.
    session.abortController?.abort()
    session.abortController = null

    this.sessions.delete(roomId)
  }
}
