import http from 'http'
import { Server } from 'socket.io'

import { TerminalManager } from './terminal'

const PORT = process.env.PORT || 4000

const server = http.createServer()
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
})

const terminalManager = new TerminalManager(io)

io.on('connection', (socket) => {
  console.log('connected', socket.id)

  socket.on('ping:client', (msg, ack) => {
    console.log('got', msg)
    ack?.({ ok: true, at: Date.now() })
  })

  socket.on('room:join', (roomId) => {
    socket.join(roomId)
    socket.to(roomId).emit('room:notice', { type: 'join', id: socket.id })
  })

  socket.on('room:leave', (roomId) => {
    socket.leave(roomId)
    socket.to(roomId).emit('room:notice', { type: 'leave', id: socket.id })
  })

  socket.on('room:message', ({ roomId, text }) => {
    io.to(roomId).emit('room:message', { id: socket.id, text })
  })

  // Shared terminal (PTY) per room.
  socket.on('terminal:join', (roomId, opts) => {
    terminalManager.join(socket, roomId, opts)
  })

  socket.on('terminal:leave', (roomId) => {
    terminalManager.leave(socket, roomId)
  })

  // Relay output from the driver to all peers in the room (exclude sender — they already wrote locally).
  socket.on('terminal:broadcast', ({ roomId, data }: { roomId: string; data: string }) => {
    terminalManager.writeToRoom(roomId, data, socket.id)
  })

  socket.on('terminal:exit-broadcast', ({ roomId, exitCode }: { roomId: string; exitCode: number }) => {
    socket.to(roomId).emit('terminal:exit', { exitCode })
  })

  socket.on('terminal:resize', ({ roomId, cols, rows }) => {
    terminalManager.resize(socket, roomId, { cols, rows })
  })

  socket.on('disconnect', (reason) => {
    console.log('bye', socket.id, reason)
    terminalManager.onDisconnect(socket)
  })
})

server.listen(PORT, () => console.log(`Socket.IO Terminal Server on :${PORT}`))
