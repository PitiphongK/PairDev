'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'

import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useTheme } from 'next-themes'
import { type Socket, io } from 'socket.io-client'

export type SharedTerminalHandle = {
  write: (data: string) => void
  clear: () => void
  run: (args: { language: string; code: string }) => Promise<void>
}

type Props = {
  roomId: string
}

function getSocketUrl() {
  if (typeof window === 'undefined') return 'http://localhost:4000'
  const fromEnv = process.env.NEXT_PUBLIC_SOCKET_URL
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim()
  return `${window.location.protocol}//${window.location.hostname}:4000`
}

function getTerminalTheme(resolvedTheme: string | undefined) {
  if (resolvedTheme === 'dark') {
    return {
      background: '#1e1e1e',
      foreground: '#ededed',
      cursor: '#ededed',
      selectionBackground: 'rgba(255, 255, 255, 0.15)',
    }
  }

  return {
    background: '#ffffff',
    foreground: '#171717',
    cursor: '#171717',
    selectionBackground: 'rgba(0, 0, 0, 0.15)',
  }
}

const SharedTerminal = forwardRef<SharedTerminalHandle, Props>(
  function SharedTerminal({ roomId }, ref) {
    const { resolvedTheme } = useTheme()
    const containerRef = useRef<HTMLDivElement | null>(null)
    const termRef = useRef<Terminal | null>(null)
    const fitRef = useRef<FitAddon | null>(null)
    const socketRef = useRef<Socket | null>(null)

    const [connected, setConnected] = useState(false)

    const clearSequence = useMemo(() => {
      // Full reset + clear screen + cursor home.
      return '\x1bc\x1b[2J\x1b[H'
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        write: (data: string) => {
          termRef.current?.write(data)
        },
        clear: () => {
          termRef.current?.write(clearSequence)
        },
        run: async ({ language, code }) => {
          const socket = socketRef.current
          if (!socket?.connected) return

          const writeBoth = (data: string) => {
            // Write directly to local terminal immediately.
            termRef.current?.write(data)
            // Broadcast to all other peers in the room.
            socket.emit('terminal:broadcast', { roomId, data })
          }

          // Clear + status line for everyone.
          writeBoth('\x1bc\x1b[2J\x1b[H')
          writeBoth(`Running ${language}...\r\n`)

          try {
            const res = await fetch('/api/run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ language, code }),
            })

            const data = await res.json() as {
              stdout?: string
              stderr?: string
              error?: string
            }

            if (!res.ok || data.error) {
              const msg = data.error ?? res.statusText
              writeBoth(`\r\n[error: ${msg}]\r\n`)
              socket.emit('terminal:exit-broadcast', { roomId, exitCode: 1 })
              termRef.current?.write('\r\n[exited with code 1]\r\n')
              return
            }

            if (data.stdout) writeBoth(data.stdout)
            if (data.stderr) writeBoth(data.stderr)

            const exitCode = data.stderr ? 1 : 0
            socket.emit('terminal:exit-broadcast', { roomId, exitCode })
            termRef.current?.write(`\r\n[exited with code ${exitCode}]\r\n`)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            writeBoth(`\r\n[error: ${msg}]\r\n`)
            socket.emit('terminal:exit-broadcast', { roomId, exitCode: 1 })
            termRef.current?.write('\r\n[exited with code 1]\r\n')
          }
        },
      }),
      [clearSequence, roomId]
    )

    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      const fit = new FitAddon()
      const term = new Terminal({
        convertEol: true,
        cursorBlink: true,
        disableStdin: true,
        scrollback: 2000,
        fontSize: 12,
        theme: getTerminalTheme(resolvedTheme),
      })

      term.loadAddon(fit)
      term.open(container)

      // Initial size
      try {
        fit.fit()
      } catch { }

      termRef.current = term
      fitRef.current = fit

      return () => {
        try {
          term.dispose()
        } catch { }
        termRef.current = null
        fitRef.current = null
      }
    }, [])

    useEffect(() => {
      const term = termRef.current
      if (!term) return
      term.options.theme = getTerminalTheme(resolvedTheme)
    }, [resolvedTheme])

    useEffect(() => {
      const socket = io(getSocketUrl(), {
        transports: ['websocket'],
        autoConnect: true,
        withCredentials: true,
      })

      socketRef.current = socket

      const onConnect = () => {
        setConnected(true)
        const term = termRef.current
        const cols = term?.cols ?? 80
        const rows = term?.rows ?? 24
        socket.emit('terminal:join', roomId, { cols, rows })
      }

      const onDisconnect = () => {
        setConnected(false)
      }

      socket.on('connect', onConnect)
      socket.on('disconnect', onDisconnect)

      socket.on('terminal:data', (chunk: string) => {
        termRef.current?.write(chunk)
      })

      socket.on(
        'terminal:exit',
        ({ exitCode, signal }: { exitCode: number; signal?: number }) => {
          termRef.current?.write(
            `\r\n[terminal exited: code=${exitCode}${signal ? ` signal=${signal}` : ''}]\r\n`
          )
        }
      )

      socket.on('terminal:error', ({ error }: { error: string }) => {
        termRef.current?.write(`\r\n[terminal error: ${error}]\r\n`)
      })

      return () => {
        try {
          socket.emit('terminal:leave', roomId)
        } catch { }

        try {
          socket.removeAllListeners()
          socket.disconnect()
        } catch { }

        socketRef.current = null
        setConnected(false)
      }
    }, [roomId])

    // Fit + resize on container changes.
    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      const fit = fitRef.current
      const term = termRef.current

      const doFit = () => {
        if (!fit || !term) return
        try {
          fit.fit()
        } catch {
          return
        }
      }

      doFit()

      const ro = new ResizeObserver(() => doFit())
      ro.observe(container)

      window.addEventListener('resize', doFit)

      return () => {
        ro.disconnect()
        window.removeEventListener('resize', doFit)
      }
    }, [roomId])

    return (
      <div className="flex flex-col gap-2 h-full min-h-0">
        {!connected ? (
          <div className="text-xs text-gray-400">Connecting…</div>
        ) : null}
        <div
          ref={containerRef}
          className="w-full flex-1 min-h-0 rounded overflow-hidden bg-surface-primary"
        />
      </div>
    )
  }
)

export default SharedTerminal
